// modules/venture-grid/llm/errors.ts
/**
 * 统一错误分类。VG 的硬规则：**没有降级**——
 * 未配置、鉴权失败、限流、超时、响应异常都必须显式抛出，由调用方转成 5xx 并落 brief_error。
 */

export type LlmErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "bad_response"
  | "network"
  | "server";

/** HTTP 状态映射：业务层直接用它返回给 UI。 */
export const LLM_ERROR_STATUS: Record<LlmErrorCode, number> = {
  not_configured: 503,
  auth: 502,
  rate_limit: 429,
  timeout: 504,
  bad_response: 502,
  network: 502,
  server: 502,
};

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "LlmError";
  }

  get status(): number {
    return LLM_ERROR_STATUS[this.code];
  }

  toUserMessage(): string {
    const suffix = this.detail === undefined ? "" : `（${this.detail}）`;
    return `${this.message}${suffix}`;
  }
}

export function isLlmError(value: unknown): value is LlmError {
  return value instanceof LlmError;
}