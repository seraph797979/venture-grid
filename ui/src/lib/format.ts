// modules/venture-grid/ui/src/lib/format.ts
import type { Trend } from "../../../domain/types";

export function formatDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function trendMark(trend: Trend): string {
  return trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
}

export function trendClass(trend: Trend): string {
  return `trend trend-${trend}`;
}

export function shortId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 10)}…`;
}

export function percent(value: number): string {
  return `${Math.round(value)}`;
}

export function parseTags(value: string): string[] {
  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}