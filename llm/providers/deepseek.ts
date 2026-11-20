// modules/venture-grid/llm/providers/deepseek.ts
/** DeepSeek（OpenAI 兼容协议）。VG 的第一优先 provider。 */
import type { Env, LlmProvider } from "../types";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4.1-flash";

export type DeepSeekEnv = Env;

export function deepseekConfig(env: DeepSeekEnv): {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
} {
  const apiKey = (env.VG_LLM_API_KEY ?? env.DEEPSEEK_API_KEY ?? "").trim();
  const baseUrl = (env.VG_LLM_BASE_URL ?? env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL).trim();
  const model =
    (env.VG_LLM_MODEL ?? env.DEEPSEEK_MODEL ?? env.PI_MODEL ?? DEFAULT_DEEPSEEK_MODEL).trim() ||
    DEFAULT_DEEPSEEK_MODEL;
  const parsed = Number.parseInt(env.VG_LLM_TIMEOUT_MS ?? "", 10);
  return {
    apiKey,
    baseUrl: baseUrl === "" ? DEFAULT_DEEPSEEK_BASE_URL : baseUrl,
    model,
    timeoutMs: Number.isFinite(parsed) && parsed > 1000 ? parsed : 60_000,
  };
}

export function createDeepSeekProvider(env: DeepSeekEnv = process.env as DeepSeekEnv): LlmProvider {
  const config = deepseekConfig(env);
  return createOpenAiCompatibleProvider({
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
}