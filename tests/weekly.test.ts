// modules/venture-grid/tests/weekly.test.ts
import { describe, expect, test } from "bun:test";
import { runWeeklyJob } from "../agent/weekly-job";
import { LlmError } from "../llm/errors";
import type { LlmProvider } from "../llm/types";
import { createTestService, seedTwoBatches, withEnv } from "./helpers";

const okProvider = (text: string): LlmProvider => ({
  id: "deepseek",
  label: "mock",
  model: "mock-weekly",
  async chat(request) {
    return {
      text,
      provider: "deepseek",
      model: "mock-weekly",
      promptChars: request.system.length + request.user.length,
      durationMs: 5,
    };
  },
});

const failingProvider = (): LlmProvider => ({
  id: "deepseek",
  label: "mock",
  model: "mock-weekly",
  async chat() {
    throw new LlmError("timeout", "模型超时");
  },
});

describe("每周 agent 工作流", () => {
  test("成功：四段齐全 + 模型综述 + run / llm_call 审计", async () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      const result = await runWeeklyJob(ctx.service, {
        batchId: ids.currentBatchId,
        provider: okProvider("本周判断趋于稳定，证据密度略有提升。"),
      });

      expect(result.status).toBe("success");
      expect(result.content).not.toBeNull();
      const batch = ctx.service.requireBatch(ids.currentBatchId);
      expect(batch.briefStatus).toBe("ready");
      expect(batch.briefError).toBeNull();
      for (const heading of [
        "## 本周新增",
        "## 分数变动",
        "## 新增证据",
        "## 新增关联",
        "## 本周综述（模型生成）",
        "## 管理员综述",
      ]) {
        expect(batch.briefContent).toContain(heading);
      }
      expect(batch.briefContent).toContain("本周判断趋于稳定");

      const runs = ctx.service.runs.listByBatch(ids.currentBatchId);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("success");
      expect(runs[0]?.finishedAt).not.toBeNull();
      expect(runs[0]?.stats.finalState).toBe("finalize");
      expect(ctx.service.llmCalls.list(5)[0]?.purpose).toBe("weekly-brief-narrative");
      expect(ctx.service.llmCalls.list(5)[0]?.status).toBe("ok");
    } finally {
      ctx.close();
    }
  });

  test("模型失败：整批 failed、内容清空、run failed、错误可追", async () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      const result = await runWeeklyJob(ctx.service, {
        batchId: ids.currentBatchId,
        provider: failingProvider(),
      });
      expect(result.status).toBe("failed");
      expect(result.content).toBeNull();
      expect(result.error).toContain("超时");

      const batch = ctx.service.requireBatch(ids.currentBatchId);
      expect(batch.briefStatus).toBe("failed");
      expect(batch.briefContent).toBe("");
      expect(batch.briefError).toContain("超时");

      const runs = ctx.service.runs.listByBatch(ids.currentBatchId);
      expect(runs[0]?.status).toBe("failed");
      expect(runs[0]?.error).toContain("超时");

      const call = ctx.service.llmCalls.list(5)[0];
      expect(call?.status).toBe("error");
      expect(call?.errorCode).toBe("timeout");
    } finally {
      ctx.close();
    }
  });

  test("未配置模型：直接拒绝，不建 run、不改批次状态", async () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      await withEnv(
        { VG_LLM_API_KEY: undefined, DEEPSEEK_API_KEY: undefined },
        async () => {
          let error: unknown = null;
          try {
            await runWeeklyJob(ctx.service, { batchId: ids.currentBatchId });
          } catch (reason) {
            error = reason;
          }
          expect(error).toBeInstanceOf(LlmError);
          expect((error as LlmError).code).toBe("not_configured");
        },
      );
      const batch = ctx.service.requireBatch(ids.currentBatchId);
      expect(batch.briefStatus).toBe("pending");
      expect(batch.briefContent).toBe("");
      expect(ctx.service.runs.listByBatch(ids.currentBatchId)).toHaveLength(0);
    } finally {
      ctx.close();
    }
  });

  test("重复生成会覆盖为新的 ready 内容（批次内只保留最新结果）", async () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      await runWeeklyJob(ctx.service, { batchId: ids.currentBatchId, provider: okProvider("第一版") });
      const second = await runWeeklyJob(ctx.service, {
        batchId: ids.currentBatchId,
        provider: okProvider("第二版"),
      });
      expect(second.status).toBe("success");
      const batch = ctx.service.requireBatch(ids.currentBatchId);
      expect(batch.briefContent).toContain("第二版");
      expect(batch.briefContent).not.toContain("第一版");
      expect(ctx.service.runs.listByBatch(ids.currentBatchId)).toHaveLength(2);
    } finally {
      ctx.close();
    }
  });
});