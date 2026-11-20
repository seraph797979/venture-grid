// modules/venture-grid/llm/http.ts
/** 共享 HTTP 调用：超时、状态码分类、JSON 解析。不做重试（重试属于业务决定）。 */
import { LlmError } from "./errors";

export const DEFAULT_TIMEOUT_MS = 60_000;

export type PostJsonOptions = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  providerLabel: string;
};

function mapStatus(status: number, providerLabel: string, bodyText: string): LlmError {
  const detail = `${providerLabel} HTTP ${status}${bodyText === "" ? "" : `: ${bodyText.slice(0, 300)}`}`;
  if (status === 401 || status === 403) return new LlmError("auth", "大模型鉴权失败", detail);
  if (status === 429) return new LlmError("rate_limit", "大模型限流，请稍后重试", detail);
  if (status >= 500) return new LlmError("server", "大模型服务端异常", detail);
  return new LlmError("bad_response", "大模型请求被拒绝", detail);
}

export async function postJson(options: PostJsonOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(options.url, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmError("timeout", `大模型调用超时（${Math.round(timeoutMs / 1000)}s）`, options.providerLabel);
    }
    throw new LlmError(
      "network",
      "无法连接大模型服务",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) throw mapStatus(response.status, options.providerLabel, text);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LlmError("bad_response", "大模型返回非 JSON", `${options.providerLabel}: ${text.slice(0, 200)}`);
  }
}

export function sha256Hex(text: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}