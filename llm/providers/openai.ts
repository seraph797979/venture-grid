// modules/venture-grid/llm/providers/openai.ts
/** OpenAI（同为 chat/completions 协议）。 */
import type { Env, LlmProvider } from "../types";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

export type OpenAIEnv = Env;

export function createOpenAIProvider(env: OpenAIEnv = process.env as OpenAIEnv): LlmProvider {
  const apiKey = (env.VG_LLM_API_KEY ?? env.OPENAI_API_KEY ?? "").trim();
  const baseUrl = (env.VG_LLM_BASE_URL ?? env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim();
  const model = (env.VG_LLM_MODEL ?? env.OPENAI_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";
  const parsed = Number.parseInt(env.VG_LLM_TIMEOUT_MS ?? "", 10);
  return createOpenAiCompatibleProvider({
    id: "openai",
    label: "OpenAI",
    baseUrl,
    apiKey,
    model,
    timeoutMs: Number.isFinite(parsed) && parsed > 1000 ? parsed : 60_000,
  });
}