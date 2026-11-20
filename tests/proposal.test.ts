// modules/venture-grid/tests/proposal.test.ts
import { describe, expect, test } from "bun:test";
import { handleApi } from "../api/router";
import { allowRequest } from "../api/rate-limit";
import type { EmailProvider } from "../email/types";
import type { LlmProvider } from "../llm/types";
import { reviewPendingProposals } from "../services/proposal-review";
import { ServiceError } from "../services/vg-service";
import { createTestService, withEnv } from "./helpers";

const VALID = {
  title: "低重力下的骨骼维持",
  summary: "长期 0.3–0.6g 暴露下的肌骨退化速度",
  hypothesis: "如果阻力训练与药物干预能够抵消大部分骨密度流失，那么低重力驻留的人力成本可以接受。",
  referencesText: "https://example.org/paper-1",
  tags: ["biology", "low-g"],
  submitter: "visitor",
  email: "visitor@example.com",
};

const memoryEmail = (): EmailProvider & { sent: Array<{ to: string; subject: string }> } => {
  const sent: Array<{ to: string; subject: string }> = [];
  return {
    id: "console",
    label: "memory",
    sent,
    async send(message) {
      sent.push({ to: message.to, subject: message.subject });
    },
  };
};

const llm = (text: string): LlmProvider => ({
  id: "deepseek",
  label: "mock",
  model: "mock",
  async chat() {
    return { text, provider: "deepseek", model: "mock", promptChars: 10, durationMs: 1 };
  },
});

describe("访客提案 · 服务层", () => {
  test("提交进入 pending；缺少邮箱被拒绝", () => {
    const ctx = createTestService();
    try {
      const before = ctx.service.ventures.count();
      const proposal = ctx.service.submitProposal(VALID);
      expect(proposal.status).toBe("pending");
      expect(proposal.email).toBe(VALID.email);
      expect(ctx.service.ventures.count()).toBe(before);
      expect(ctx.service.countPendingProposals()).toBe(1);

      expect(() => ctx.service.submitProposal({ ...VALID, email: "not-an-email" })).toThrow(ServiceError);
    } finally {
      ctx.close();
    }
  });

  test("AI 采纳：生成 Venture、写 review 信息、发确认邮件", async () => {
    const ctx = createTestService();
    try {
      const proposal = ctx.service.submitProposal(VALID);
      const email = memoryEmail();
      const summary = await reviewPendingProposals(ctx.service, {
        provider: llm('{"decision":"accept","reason":"符合长期宜居方向","tags":["gravity"]}'),
        emailProvider: email,
      });
      expect(summary.accepted).toBe(1);
      expect(summary.emailSent).toBe(1);
      expect(email.sent[0]?.subject).toContain("已采纳");

      const updated = ctx.service.requireProposal(proposal.id);
      expect(updated.status).toBe("accepted");
      expect(updated.reviewedBy).toBe("ai");
      expect(updated.ventureId).not.toBeNull();
      const venture = ctx.service.ventures.get(updated.ventureId!);
      expect(venture?.tags).toContain("gravity");
      expect(ctx.service.listEmailLogs(5)[0]?.status).toBe("sent");
    } finally {
      ctx.close();
    }
  });

  test("AI 拒绝：不生成 Venture、发拒绝邮件", async () => {
    const ctx = createTestService();
    try {
      const proposal = ctx.service.submitProposal(VALID);
      const email = memoryEmail();
      const summary = await reviewPendingProposals(ctx.service, {
        provider: llm('```json\n{"decision":"reject","reason":"与已有分支重复","tags":[]}\n```'),
        emailProvider: email,
      });
      expect(summary.rejected).toBe(1);
      expect(summary.emailSent).toBe(1);
      expect(email.sent[0]?.subject).toContain("未采纳");
      expect(ctx.service.requireProposal(proposal.id).status).toBe("rejected");
      expect(ctx.service.ventures.count()).toBe(0);
    } finally {
      ctx.close();
    }
  });

  test("模型输出不可解析：保持 pending，不误处理", async () => {
    const ctx = createTestService();
    try {
      const proposal = ctx.service.submitProposal(VALID);
      const summary = await reviewPendingProposals(ctx.service, {
        provider: llm("我觉得可以。"),
        emailProvider: memoryEmail(),
      });
      expect(summary.failed).toBe(1);
      expect(ctx.service.requireProposal(proposal.id).status).toBe("pending");
    } finally {
      ctx.close();
    }
  });

  test("限流：同一 key 每小时 3 次", () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    expect(allowRequest(key, 3, 60 * 60 * 1000)).toBe(true);
    expect(allowRequest(key, 3, 60 * 60 * 1000)).toBe(true);
    expect(allowRequest(key, 3, 60 * 60 * 1000)).toBe(true);
    expect(allowRequest(key, 3, 60 * 60 * 1000)).toBe(false);
  });
});

describe("访客提案 · API", () => {
  const postJson = (
    ctx: ReturnType<typeof createTestService>,
    path: string,
    body: unknown,
    ip: string,
    token?: string,
  ) =>
    handleApi(
      new Request(`http://vg.test${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      }),
      ctx.service,
    );

  test("公开提交无需令牌 → 201；蜜罐 → 422", async () => {
    const ctx = createTestService();
    try {
      await withEnv({ VG_PUBLIC_SUBMIT: "1" }, async () => {
        const response = await postJson(ctx, "/api/vg/proposals", VALID, "10.1.0.1");
        expect(response.status).toBe(201);
        const bot = await postJson(
          ctx,
          "/api/vg/proposals",
          { ...VALID, website: "http://spam.example" },
          "10.1.0.2",
        );
        expect(bot.status).toBe(422);
      });
    } finally {
      ctx.close();
    }
  });

  test("关闭开关 → 403；列表需令牌", async () => {
    const ctx = createTestService();
    try {
      await withEnv({ VG_PUBLIC_SUBMIT: "0" }, async () => {
        expect((await postJson(ctx, "/api/vg/proposals", VALID, "10.2.0.1")).status).toBe(403);
      });
      await withEnv({ VG_ADMIN_TOKEN: "t" }, async () => {
        const denied = await handleApi(new Request("http://vg.test/api/vg/proposals"), ctx.service);
        expect(denied.status).toBe(401);
        const allowed = await handleApi(
          new Request("http://vg.test/api/vg/proposals", {
            headers: { authorization: "Bearer t" },
          }),
          ctx.service,
        );
        expect(allowed.status).toBe(200);
        const payload = (await allowed.json()) as { emailLogs: unknown[] };
        expect(Array.isArray(payload.emailLogs)).toBe(true);
      });
    } finally {
      ctx.close();
    }
  });
});