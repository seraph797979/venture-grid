// modules/venture-grid/tests/api.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { handleApi } from "../api/router";
import { createTestService, seedTwoBatches, withEnv } from "./helpers";

let mock: ReturnType<typeof Bun.serve> | null = null;
let mockBase = "";

beforeAll(() => {
  mock = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (!new URL(request.url).pathname.endsWith("/chat/completions")) {
        return new Response("not found", { status: 404 });
      }
      await request.json();
      return Response.json({
        id: "mock",
        choices: [{ index: 0, message: { role: "assistant", content: "由测试假模型生成的摘要。" } }],
      });
    },
  });
  mockBase = `http://127.0.0.1:${mock.port}/v1`;
});

afterAll(() => {
  mock?.stop(true);
});

const call = (path: string, init?: RequestInit): Promise<Response> =>
  handleApi(new Request(`http://vg.test${path}`, init), currentService);

let currentService: ReturnType<typeof createTestService>["service"];

const post = (path: string, body: unknown, token = "t") =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const parse = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

describe("API 路由", () => {
  test("健康检查公开可读", async () => {
    const ctx = createTestService();
    currentService = ctx.service;
    try {
      const response = await call("/api/vg/health");
      expect(response.status).toBe(200);
      expect((await parse(response)).ok).toBe(true);
    } finally {
      ctx.close();
    }
  });

  test("未配置 VG_ADMIN_TOKEN → 写接口 503；错误令牌 → 401", async () => {
    const ctx = createTestService();
    currentService = ctx.service;
    try {
      await withEnv({ VG_ADMIN_TOKEN: undefined }, async () => {
        const response = await post("/api/vg/ventures", { title: "x" });
        expect(response.status).toBe(503);
        expect((await parse(response)).code).toBe("admin_not_configured");
      });
      await withEnv({ VG_ADMIN_TOKEN: "t" }, async () => {
        const response = await post("/api/vg/ventures", { title: "x" }, "wrong");
        expect(response.status).toBe(401);
      });
    } finally {
      ctx.close();
    }
  });

  test("有令牌建 Venture → 201，并写事件", async () => {
    const ctx = createTestService();
    currentService = ctx.service;
    try {
      await withEnv({ VG_ADMIN_TOKEN: "t" }, async () => {
        const response = await post("/api/vg/ventures", { title: "API venture" });
        expect(response.status).toBe(201);
        const payload = await parse(response);
        const venture = payload.venture as Record<string, unknown>;
        expect(venture.title).toBe("API venture");
        expect(ctx.service.events.count("venture_added")).toBe(1);

        const list = await parse(await call("/api/vg/ventures"));
        expect((list.ventures as unknown[]).length).toBe(1);
      });
    } finally {
      ctx.close();
    }
  });

  test("无大模型 → 证据接口 503 且不落库", async () => {
    const ctx = createTestService();
    currentService = ctx.service;
    try {
      const ids = seedTwoBatches(ctx.service);
      await withEnv(
        {
          VG_ADMIN_TOKEN: "t",
          VG_LLM_API_KEY: undefined,
          DEEPSEEK_API_KEY: undefined,
        },
        async () => {
          const before = ctx.service.evidences.listByVenture(ids.rootId).length;
          const response = await post(`/api/vg/ventures/${ids.rootId}/evidences`, {
            sourceTitle: "s",
            rawText: "raw",
          });
          expect(response.status).toBe(503);
          expect((await parse(response)).code).toBe("llm_not_configured");
          expect(ctx.service.evidences.listByVenture(ids.rootId).length).toBe(before);
        },
      );
    } finally {
      ctx.close();
    }
  });

  test("有大模型 → 证据 201、摘要来自模型、审计落表", async () => {
    const ctx = createTestService();
    currentService = ctx.service;
    try {
      const ids = seedTwoBatches(ctx.service);
      await withEnv(
        {
          VG_ADMIN_TOKEN: "t",
          VG_LLM_PROVIDER: "deepseek",
          VG_LLM_API_KEY: "k",
          VG_LLM_BASE_URL: mockBase,
          VG_LLM_MODEL: "mock-model",
          DEEPSEEK_API_KEY: undefined,
        },
        async () => {
          const response = await post(`/api/vg/ventures/${ids.rootId}/evidences`, {
            sourceTitle: "mock source",
            rawText: "raw text",
            tags: ["a", "b"],
          });
          expect(response.status).toBe(201);
          const payload = await parse(response);
          const evidence = payload.evidence as Record<string, unknown>;
          expect(evidence.abstract).toBe("由测试假模型生成的摘要。");
          expect(evidence.abstractSource).toBe("llm");
          expect((evidence.tags as unknown[]).length).toBe(2);
          const calls = ctx.service.llmCalls.list(10);
          expect(calls[0]?.purpose).toBe("evidence-abstract");
          expect(calls[0]?.status).toBe("ok");
          expect(calls[0]?.model).toBe("mock-model");
        },
      );
    } finally {
      ctx.close();
    }
  });

  test("同批次重复打分 → 409；快照导入 → 201", async () => {
    const ctx = createTestService();
    currentService = ctx.service;
    try {
      const ids = seedTwoBatches(ctx.service);
      await withEnv({ VG_ADMIN_TOKEN: "t" }, async () => {
        const duplicate = await post(`/api/vg/ventures/${ids.rootId}/scores`, {
          score: 70,
          comment: "again",
          batchId: ids.currentBatchId,
        });
        expect(duplicate.status).toBe(409);

        const snapshot = ctx.service.exportSnapshot();
        const imported = await post("/api/vg/snapshots/import", { snapshot });
        expect(imported.status).toBe(201);
        const payload = await parse(imported);
        expect((payload.counts as Record<string, number>).ventures).toBe(2);
      });
    } finally {
      ctx.close();
    }
  });

  test("文档列表/详情与未知路径", async () => {
    const ctx = createTestService();
    currentService = ctx.service;
    try {
      ctx.service.createDocument({ slug: "guide", title: "指南", kind: "guide", bodyMd: "# 指南" });
      const list = await parse(await call("/api/vg/documents"));
      expect((list.documents as unknown[]).length).toBe(1);
      const detail = await parse(await call("/api/vg/documents/guide"));
      expect(detail.slug).toBe("guide");
      expect((await call("/api/vg/nope")).status).toBe(404);
    } finally {
      ctx.close();
    }
  });
});