// modules/venture-grid/domain/trend.ts
import type { Trend } from "./types";

/** 分数变化小于该阈值视为持平（避免浮点噪声把 0.0001 判成上升）。 */
export const TREND_EPSILON = 0.005;

/**
 * 与上一批对比：无上一批时视为持平。
 * 结果会持久化进 vg_score.trend，之后不再回算，保证历史可复现。
 */
export function computeTrend(current: number, previous?: number | null): Trend {
  if (previous === undefined || previous === null || Number.isNaN(previous)) return "flat";
  const delta = current - previous;
  if (Math.abs(delta) < TREND_EPSILON) return "flat";
  return delta > 0 ? "up" : "down";
}

/** 趋势的中文/英文标签由 UI i18n 负责，这里只提供稳定机器值。 */
export function isTrend(value: unknown): value is Trend {
  return value === "up" || value === "flat" || value === "down";
}