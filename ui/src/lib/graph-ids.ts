// modules/venture-grid/ui/src/lib/graph-ids.ts
/** 前端本地常量，避免跨目录值引用服务端 domain（Docker 前端构建阶段只有 ui/）。 */
export const ORIGIN_ID = "__origin__";
export const TARGET_ANCHOR_ID = "__target_anchor__";