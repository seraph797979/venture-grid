// modules/venture-grid/llm/providers/anthropic.ts
/**
 * Anthropic Messages API（字段与 OpenAI 不同，单独适配）。
 * 注意：不使用仓库主控制台的 ANTHROPIC_API_KEY（那里面常是 `deepseek::<key>` 的代理格式），
 *      这里只认 VG_LLM_API_KEY / ANTHROPIC_LLM_API_KEY，避免把代理密钥发到官方端点。
 */
import { LlmError } from "../errors";
import { DEFAULT_TIMEOUT_MS, postJson } from "../http";
import type { Env, LlmProvider, LlmReply, LlmRequest } from "../types";

type MessagesResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

export type AnthropicEnv = Env;

export function createAnthropicProvider(env: AnthropicEnv = process.env as AnthropicEnv): LlmProvider {
  const apiKey = (env.VG_LLM_API_KEY ?? env.ANTHROPIC_LLM_API_KEY ?? "").trim();
  const baseUrl = (
    env.VG_LLM_BASE_URL ??
    env.ANTHROPIC_LLM_BASE_URL ??
    "https://api.anthropic.com"
  ).replace(/\/+$/, "");
  const model = (env.VG_LLM_MODEL ?? "claude-sonnet-4-5").trim() || "claude-sonnet-4-5";
  const parsed = Number.parseInt(env.VG_LLM_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(parsed) && parsed > 1000 ? parsed : DEFAULT_TIMEOUT_MS;

  return {
    id: "anthropic",
    label: "Anthropic",
    model,
    async chat(request: LlmRequest): Promise<LlmReply> {
      if (apiKey === "") throw new LlmError("not_configured", "Anthropic 未配置 API Key");
      const startedAt = Date.now();
      const raw = (await postJson({
        url: `${baseUrl}/v1/messages`,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: {
          model,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.4,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        },
        timeoutMs,
        providerLabel: "Anthropic",
      })) as MessagesResponse;

      const text = (raw.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("\n")
        .trim();
      if (text === "") {
        throw new LlmError(
          "bad_response",
          "Anthropic 返回空内容",
          raw.error?.message ?? "content[].text 为空",
        );
      }
      return {
        text,
        provider: "anthropic",
        model,
        promptChars: request.system.length + request.user.length,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}