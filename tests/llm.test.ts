// modules/venture-grid/tests/llm.test.ts
import { describe, expect, test } from "bun:test";
import { LlmError } from "../llm/errors";
import { describeLlm, llmAvailable, providerIdFromEnv, resolveProvider } from "../llm/registry";
import { deepseekConfig, DEFAULT_DEEPSEEK_MODEL } from "../llm/providers/deepseek";
import { withEnv } from "./helpers";

describe("LLM 适配器", () => {
  test("未配置密钥时 resolveProvider 抛 not_configured（无降级）", async () => {
    await withEnv(
      {
        VG_LLM_PROVIDER: "deepseek",
        VG_LLM_API_KEY: undefined,
        DEEPSEEK_API_KEY: undefined,
      },
      () => {
        expect(llmAvailable()).toBe(false);
        expect(() => resolveProvider()).toThrow(LlmError);
        try {
          resolveProvider();
        } catch (error) {
          expect((error as LlmError).code).toBe("not_configured");
          expect((error as LlmError).status).toBe(503);
        }
        expect(describeLlm().configured).toBe(false);
        expect(describeLlm().hint).toContain("VG_LLM_API_KEY");
      },
    );
  });

  test("DeepSeek 默认端点与模型；env 优先", async () => {
    await withEnv(
      {
        VG_LLM_PROVIDER: undefined,
        VG_LLM_API_KEY: "k",
        DEEPSEEK_API_KEY: "dk",
        VG_LLM_BASE_URL: undefined,
        DEEPSEEK_BASE_URL: undefined,
        VG_LLM_MODEL: undefined,
        DEEPSEEK_MODEL: undefined,
        PI_MODEL: undefined,
      },
      () => {
        const config = deepseekConfig(process.env);
        expect(config.apiKey).toBe("k");
        expect(config.baseUrl).toBe("https://api.deepseek.com/v1");
        expect(config.model).toBe(DEFAULT_DEEPSEEK_MODEL);
        const provider = resolveProvider();
        expect(provider.id).toBe("deepseek");
        expect(provider.model).toBe(DEFAULT_DEEPSEEK_MODEL);
      },
    );

    await withEnv(
      {
        VG_LLM_API_KEY: "k2",
        VG_LLM_BASE_URL: "https://example.test/v1",
        VG_LLM_MODEL: "deepseek-v4.1",
      },
      () => {
        const config = deepseekConfig(process.env);
        expect(config.apiKey).toBe("k2");
        expect(config.baseUrl).toBe("https://example.test/v1");
        expect(config.model).toBe("deepseek-v4.1");
      },
    );
  });

  test("未知 provider → not_configured；错误码映射到 HTTP 状态", async () => {
    await withEnv({ VG_LLM_PROVIDER: "nope", VG_LLM_API_KEY: "k" }, () => {
      expect(() => providerIdFromEnv()).toThrow(LlmError);
      expect(() => resolveProvider()).toThrow(LlmError);
    });
    expect(new LlmError("auth", "x").status).toBe(502);
    expect(new LlmError("rate_limit", "x").status).toBe(429);
    expect(new LlmError("timeout", "x").status).toBe(504);
    expect(new LlmError("not_configured", "x").status).toBe(503);
  });

  test("anthropic 不读取 ANTHROPIC_API_KEY（避免代理格式密钥外发）", async () => {
    await withEnv(
      {
        VG_LLM_PROVIDER: "anthropic",
        VG_LLM_API_KEY: undefined,
        ANTHROPIC_LLM_API_KEY: undefined,
        ANTHROPIC_API_KEY: "deepseek::secret",
      },
      () => {
        expect(() => resolveProvider()).toThrow(LlmError);
      },
    );
  });
});