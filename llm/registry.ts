// modules/venture-grid/llm/registry.ts
/**
 * Provider 注册表：按 VG_LLM_PROVIDER 选择实现。
 * 新增厂商 = 新增一个 providers/xxx.ts + 在 FACTORIES 里加一行；业务代码不动。
 */
import { LlmError } from "./errors";
import { createAnthropicProvider } from "./providers/anthropic";
import { createDeepSeekProvider, deepseekConfig } from "./providers/deepseek";
import { createOpenAIProvider } from "./providers/openai";
import type { Env, LlmProvider, LlmProviderId, LlmStatus } from "./types";

export const PROVIDER_IDS: readonly LlmProviderId[] = ["deepseek", "openai", "anthropic"];

const FACTORIES: Record<LlmProviderId, (env: Env) => LlmProvider> = {
  deepseek: (env) => createDeepSeekProvider(env),
  openai: (env) => createOpenAIProvider(env),
  anthropic: (env) => createAnthropicProvider(env),
};

export function providerIdFromEnv(env: Env = process.env): LlmProviderId {
  const raw = (env.VG_LLM_PROVIDER ?? "deepseek").trim().toLowerCase();
  if ((PROVIDER_IDS as readonly string[]).includes(raw)) return raw as LlmProviderId;
  throw new LlmError(
    "not_configured",
    `未知的 VG_LLM_PROVIDER：${raw}`,
    `可选值：${PROVIDER_IDS.join(" / ")}`,
  );
}

/** 未配置密钥时抛 not_configured；业务层必须显式处理（无降级）。 */
export function resolveProvider(env: Env = process.env): LlmProvider {
  const id = providerIdFromEnv(env);
  const provider = FACTORIES[id](env);
  const keyPresent =
    id === "deepseek"
      ? deepseekConfig(env).apiKey !== ""
      : id === "openai"
        ? (env.VG_LLM_API_KEY ?? env.OPENAI_API_KEY ?? "").trim() !== ""
        : (env.VG_LLM_API_KEY ?? env.ANTHROPIC_LLM_API_KEY ?? "").trim() !== "";
  if (!keyPresent) {
    throw new LlmError(
      "not_configured",
      `${provider.label} 未配置 API Key`,
      id === "deepseek" ? "请设置 VG_LLM_API_KEY 或 DEEPSEEK_API_KEY" : "请设置 VG_LLM_API_KEY",
    );
  }
  return provider;
}

export function llmAvailable(env: Env = process.env): boolean {
  try {
    resolveProvider(env);
    return true;
  } catch {
    return false;
  }
}

export function describeLlm(env: Env = process.env): LlmStatus {
  let provider: string | null = null;
  let model: string | null = null;
  try {
    const resolved = resolveProvider(env);
    provider = resolved.label;
    model = resolved.model;
  } catch {
    provider = null;
    model = null;
  }
  const id = providerIdFromEnv(env);
  const hint =
    provider === null
      ? id === "deepseek"
        ? "设置 VG_LLM_API_KEY 或 DEEPSEEK_API_KEY（可选 VG_LLM_MODEL，默认 deepseek-v4.1-flash）"
        : "设置 VG_LLM_API_KEY（可选 VG_LLM_MODEL / VG_LLM_BASE_URL）"
      : "已配置；证据摘要与每周简报将实时调用模型";
  return { configured: provider !== null, provider, model, hint };
}