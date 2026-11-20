// modules/venture-grid/domain/ids.ts
/** 统一 ID 生成：`vg_<uuid>`，便于机器识别与日志检索。 */
export type IdPrefix =
  | "vg"
  | "vge"
  | "vgl"
  | "vgs"
  | "vgb"
  | "vgevt"
  | "vgdoc"
  | "vgrun"
  | "vgllm"
  | "vgsnap"
  | "vgds"
  | "vgprop"
  | "vgemail";

export function newId(prefix: IdPrefix = "vg"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** 测试/导入时允许注入确定性 ID 生成器。 */
export type IdFactory = (prefix: IdPrefix) => string;

export const defaultIdFactory: IdFactory = (prefix) => newId(prefix);

export function nowIso(): string {
  return new Date().toISOString();
}