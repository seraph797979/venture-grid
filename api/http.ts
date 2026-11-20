// modules/venture-grid/api/http.ts
/** API 共用小工具：JSON 响应、错误体、管理员令牌、请求体解析。 */
export const API_PREFIX = "/api/vg";

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function errorResponse(status: number, code: string, message: string, detail?: unknown): Response {
  return json({ ok: false, code, error: message, detail }, status);
}

export function ok(data: Record<string, unknown> = {}): Response {
  return json({ ok: true, ...data });
}

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * 写操作闸门：服务端未配置 VG_ADMIN_TOKEN 时一律 503（绝不默认放行），
 * 配置后校验 Authorization: Bearer <token> 或 x-vg-admin-token。
 */
export function adminGuard(request: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const expected = (env.VG_ADMIN_TOKEN ?? "").trim();
  if (expected === "") {
    return errorResponse(
      503,
      "admin_not_configured",
      "服务端未配置 VG_ADMIN_TOKEN，写操作已禁用",
      "在环境变量中设置 VG_ADMIN_TOKEN 后重启服务",
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : (request.headers.get("x-vg-admin-token") ?? "").trim();
  if (provided === "" || !safeEqual(provided, expected)) {
    return errorResponse(401, "unauthorized", "管理员令牌无效");
  }
  return null;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // 允许无 body 的 POST
    const text = await request.text();
    if (text.trim() === "") return {};
    return errorResponse(415, "unsupported_media_type", "请求体必须是 application/json");
  }
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return errorResponse(422, "validation", "请求体必须是 JSON 对象");
    }
    return parsed as Record<string, unknown>;
  } catch {
    return errorResponse(400, "invalid_json", "请求体不是合法 JSON");
  }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function queryInt(url: URL, key: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(key);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
}

export function slugFromPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const value = rest.split("/")[0] ?? "";
  return value === "" ? null : decodeURIComponent(value);
}