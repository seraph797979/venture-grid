// modules/venture-grid/api/rate-limit.ts
/**
 * 极简内存限流：访客提交用。
 * 单进程 + 单管理员场景足够；重启即清空，不做持久化。
 */
const buckets = new Map<string, number[]>();

export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (buckets.get(key) ?? []).filter((at) => at > cutoff);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  // 顺手清理过期桶，避免长期运行内存增长
  if (buckets.size > 2000) {
    for (const [bucketKey, times] of buckets) {
      if (times.every((at) => at <= cutoff)) buckets.delete(bucketKey);
    }
  }
  return true;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.trim() !== "") return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}