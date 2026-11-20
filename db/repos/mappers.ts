// modules/venture-grid/db/repos/mappers.ts
/** 行 ↔ 领域对象映射的公共小工具。 */

export function parseStringArray(value: string | null | undefined): string[] {
  if (value === null || value === undefined || value === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function parseObject(value: string | null | undefined): Record<string, unknown> {
  if (value === null || value === undefined || value === "") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function encodeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}