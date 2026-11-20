// modules/venture-grid/llm/providers/openai-compatible.ts
/**
 * OpenAI 兼容协议（DeepSeek 也走这套）。
 * 只实现 chat/completions 的一轮调用；不流式、不重试。
 */
import { LlmError } from "../errors";
import { DEFAULT_TIMEOUT_MS, postJson } from "../http";
import type { LlmProviderId, LlmProvider, LlmReply, LlmRequest } from "../types";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

export type OpenAICompatibleOptions = {
  id: LlmProviderId;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

export function createOpenAiCompatibleProvider(options: OpenAICompatibleOptions): LlmProvider {
  const base = options.baseUrl.replace(/\/+$/, "");
  return {
    id: options.id,
    label: options.label,
    model: options.model,
    async chat(request: LlmRequest): Promise<LlmReply> {
      if (options.apiKey.trim() === "") {
        throw new LlmError("not_configured", `${options.label} 未配置 API Key`);
      }
      const startedAt = Date.now();
      const payload = {
        model: options.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        temperature: request.temperature ?? 0.4,
        ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
      };
      const raw = (await postJson({
        url: `${base}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: payload,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        providerLabel: options.label,
      })) as ChatCompletionResponse;
      const content = raw.choices?.[0]?.message?.content ?? "";
      if (typeof content !== "string" || content.trim() === "") {
        throw new LlmError(
          "bad_response",
          "大模型返回空内容",
          raw.error?.message ?? "choices[0].message.content 为空",
        );
      }
      return {
        text: content.trim(),
        provider: options.id,
        model: options.model,
        promptChars: request.system.length + request.user.length,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}