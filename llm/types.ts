// modules/venture-grid/llm/types.ts
/** LLM 适配层最小契约：只做「一轮文本生成」，业务语义留在调用方。 */

export type LlmProviderId = "deepseek" | "openai" | "anthropic";

/** 环境变量读取面：允许 process.env 与测试对象互转。 */
export type Env = Record<string, string | undefined>;

export type LlmRequest = {
  system: string;
  user: string;
  /** 用于审计与日志，不参与提示词 */
  purpose: string;
  maxTokens?: number;
  temperature?: number;
};

export type LlmReply = {
  text: string;
  provider: LlmProviderId;
  model: string;
  promptChars: number;
  durationMs: number;
};

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly label: string;
  readonly model: string;
  /** 未配置密钥时抛 LlmError(not_configured)；HTTP/网络异常同样抛 LlmError。 */
  chat(request: LlmRequest): Promise<LlmReply>;
}

export type LlmStatus = {
  configured: boolean;
  provider: string | null;
  model: string | null;
  hint: string;
};