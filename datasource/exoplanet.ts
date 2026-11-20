// modules/venture-grid/datasource/exoplanet.ts
/** NASA Exoplanet Archive TAP 接口（公开、无需密钥）。 */
import { buildExoplanetQuery, normalizeExoplanetRow, type DatasetConfig, type ExoplanetRow } from "../domain/dataset";

export const EXOPLANET_ENDPOINT = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
export const EXOPLANET_SOURCE_URL = "https://exoplanetarchive.ipac.caltech.edu/";
export const EXOPLANET_DEFAULT_TIMEOUT_MS = 20_000;

/** 与全局 fetch 兼容的可注入签名（Bun 的 fetch 还带 preconnect，测试桩不需要）。 */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class DataSourceError extends Error {
  constructor(
    readonly code: "timeout" | "network" | "http" | "bad_response",
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "DataSourceError";
  }
}

export type FetchExoplanetsOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

export async function fetchExoplanets(
  config: DatasetConfig,
  options: FetchExoplanetsOptions = {},
): Promise<{ rows: ExoplanetRow[]; fetchedAt: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? EXOPLANET_DEFAULT_TIMEOUT_MS;
  const url = `${EXOPLANET_ENDPOINT}?query=${encodeURIComponent(buildExoplanetQuery(config))}&format=json`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new DataSourceError("timeout", `NASA Exoplanet Archive 超时（${Math.round(timeoutMs / 1000)}s）`);
    }
    throw new DataSourceError(
      "network",
      "无法连接 NASA Exoplanet Archive",
      error instanceof Error ? error.message : String(error),
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new DataSourceError(
      "http",
      `NASA Exoplanet Archive HTTP ${response.status}`,
      text.slice(0, 300),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new DataSourceError("bad_response", "NASA Exoplanet Archive 返回非 JSON", text.slice(0, 200));
  }
  if (!Array.isArray(parsed)) {
    throw new DataSourceError("bad_response", "NASA Exoplanet Archive 返回结构异常", text.slice(0, 200));
  }

  const rows = parsed
    .map(normalizeExoplanetRow)
    .filter((row): row is ExoplanetRow => row !== null);

  return { rows, fetchedAt: new Date().toISOString() };
}