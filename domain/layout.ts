// modules/venture-grid/domain/layout.ts
/**
 * 左→右线性时序布局（纯函数）。
 * - x 由 parent 链深度决定，分支自然向右延伸
 * - 同层用「重心排序」（barycenter）减少父子连线交叉：
 *   先按父节点位置排序，再按子节点位置回排，做两轮
 * - 父分支线宽随子树体量增加（weight），关系线保持细线
 * - 末端节点以虚线收敛到目标锚：最终不适宜环境下的文明存续
 * 不依赖 dagre，布局确定、可复现。
 */
import type { RelationType, Trend, Venture, VentureLink, VentureStatus } from "./types";

export const GAP_X = 340;
export const ROW_GAP_Y = 150;
export const TARGET_ANCHOR_ID = "__target_anchor__";
/** 目标锚的语义由 UI 用 i18n 文案渲染；这里只保留稳定标识。 */
export const TARGET_ANCHOR_TITLE = "Target Anchor";
/** 图谱左侧的统一起点（参考视觉：实心青绿圆）。 */
export const ORIGIN_ID = "__origin__";
export const ORIGIN_TITLE = "起点";

export type GraphNode = {
  id: string;
  title: string;
  status: VentureStatus | "anchor" | "origin";
  tags: string[];
  depth: number;
  x: number;
  y: number;
  score: number | null;
  trend: Trend | null;
  isAnchor: boolean;
  parentId: string | null;
  createdAt: string | null;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "origin" | "parent" | "relation" | "anchor";
  relationType: RelationType | null;
  note: string | null;
  /** 父分支/起点边：1 + 子树节点数；其他边为 1 */
  weight: number;
  /** 该流向对应 Venture 的最新分数（无分则为 null） */
  score: number | null;
  trend: Trend | null;
};

export type LatestScore = { score: number; trend: Trend };

export type BuildGraphInput = {
  ventures: Venture[];
  links: VentureLink[];
  latestScores?: Map<string, LatestScore>;
};

export type BuildGraphResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxDepth: number;
};

/** 沿 parentId 求深度；缺失父节点按根处理，带环保护。 */
export function computeDepths(ventures: Venture[]): Map<string, number> {
  const byId = new Map(ventures.map((venture) => [venture.id, venture]));
  const depths = new Map<string, number>();

  const resolve = (id: string, seen: Set<string>): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const venture = byId.get(id);
    if (venture === undefined) return 0;
    if (seen.has(id)) return 0; // 环：断开，按根处理
    seen.add(id);
    const parent = venture.parentId;
    const depth =
      parent !== null && parent !== "" && byId.has(parent)
        ? resolve(parent, seen) + 1
        : 0;
    depths.set(id, depth);
    return depth;
  };

  for (const venture of ventures) resolve(venture.id, new Set<string>());
  return depths;
}

function sortStable(a: Venture, b: Venture): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
}

/** 每个节点的后代数量（用于线宽），带环保护与记忆化。 */
export function computeDescendants(ventures: Venture[]): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const venture of ventures) {
    if (venture.parentId === null || venture.parentId === "") continue;
    const list = children.get(venture.parentId) ?? [];
    list.push(venture.id);
    children.set(venture.parentId, list);
  }
  const memo = new Map<string, number>();
  const count = (id: string, seen: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    let total = 0;
    for (const child of children.get(id) ?? []) total += 1 + count(child, seen);
    memo.set(id, total);
    return total;
  };
  for (const venture of ventures) count(venture.id, new Set<string>());
  return memo;
}

export function buildGraph(input: BuildGraphInput): BuildGraphResult {
  const { ventures, links } = input;
  const latestScores = input.latestScores ?? new Map<string, LatestScore>();
  const depths = computeDepths(ventures);
  const byId = new Map(ventures.map((venture) => [venture.id, venture]));

  const groups = new Map<number, Venture[]>();
  for (const venture of ventures) {
    const depth = depths.get(venture.id) ?? 0;
    const list = groups.get(depth) ?? [];
    list.push(venture);
    groups.set(depth, list);
  }

  const depthsSorted = [...groups.keys()].sort((a, b) => a - b);
  const order = new Map<number, Venture[]>();
  for (const depth of depthsSorted) {
    order.set(depth, [...(groups.get(depth) ?? [])].sort(sortStable));
  }

  const position = new Map<string, number>();
  const assign = (): void => {
    for (const depth of depthsSorted) {
      (order.get(depth) ?? []).forEach((venture, index) => position.set(venture.id, index));
    }
  };
  assign();

  const childrenOf = new Map<string, string[]>();
  for (const venture of ventures) {
    if (venture.parentId === null || venture.parentId === "" || !byId.has(venture.parentId)) continue;
    const list = childrenOf.get(venture.parentId) ?? [];
    list.push(venture.id);
    childrenOf.set(venture.parentId, list);
  }

  const maxDepthValue = depthsSorted[depthsSorted.length - 1] ?? 0;

  // 两轮：向下按父节点重心排，向上按子节点重心回排（减少交叉）
  for (let pass = 0; pass < 2; pass += 1) {
    for (const depth of depthsSorted) {
      if (depth === 0) continue;
      const list = order.get(depth) ?? [];
      const scored = list.map((venture) => {
        const parent =
          venture.parentId !== null && venture.parentId !== "" && byId.has(venture.parentId)
            ? venture.parentId
            : null;
        return {
          venture,
          score: parent === null ? list.length + 1 : (position.get(parent) ?? list.length + 1),
        };
      });
      scored.sort((a, b) => a.score - b.score || sortStable(a.venture, b.venture));
      order.set(depth, scored.map((item) => item.venture));
      scored.forEach((item, index) => position.set(item.venture.id, index));
    }

    for (const depth of [...depthsSorted].reverse()) {
      if (depth === maxDepthValue) continue;
      const list = order.get(depth) ?? [];
      const scored = list.map((venture) => {
        const kids = (childrenOf.get(venture.id) ?? [])
          .map((id) => position.get(id))
          .filter((value): value is number => value !== undefined);
        const score =
          kids.length > 0
            ? kids.reduce((sum, value) => sum + value, 0) / kids.length
            : (position.get(venture.id) ?? 0);
        return { venture, score };
      });
      scored.sort((a, b) => a.score - b.score || sortStable(a.venture, b.venture));
      order.set(depth, scored.map((item) => item.venture));
      scored.forEach((item, index) => position.set(item.venture.id, index));
    }
  }

  const nodes: GraphNode[] = [];
  let maxDepth = 0;

  for (const depth of depthsSorted) {
    maxDepth = Math.max(maxDepth, depth);
    const list = order.get(depth) ?? [];
    const offset = (list.length - 1) / 2;
    list.forEach((venture, index) => {
      const latest = latestScores.get(venture.id);
      nodes.push({
        id: venture.id,
        title: venture.title,
        status: venture.status,
        tags: venture.tags,
        depth,
        x: depth * GAP_X,
        y: Math.round((index - offset) * ROW_GAP_Y),
        score: latest?.score ?? null,
        trend: latest?.trend ?? null,
        isAnchor: false,
        parentId: venture.parentId,
        createdAt: venture.createdAt,
      });
    });
  }

  const descendants = computeDescendants(ventures);
  const edges: GraphEdge[] = [];
  const scoreOf = (id: string): { score: number | null; trend: Trend | null } => {
    const latest = latestScores.get(id);
    return { score: latest?.score ?? null, trend: latest?.trend ?? null };
  };

  // 起点 → 根节点：粗青绿流束的入口
  const roots = ventures.filter((venture) => depths.get(venture.id) === 0);
  for (const root of roots) {
    edges.push({
      id: `origin:${root.id}`,
      source: ORIGIN_ID,
      target: root.id,
      kind: "origin",
      relationType: null,
      note: null,
      weight: 1 + (descendants.get(root.id) ?? 0),
      ...scoreOf(root.id),
    });
  }

  for (const venture of ventures) {
    if (venture.parentId === null || !depths.has(venture.parentId)) continue;
    edges.push({
      id: `parent:${venture.parentId}->${venture.id}`,
      source: venture.parentId,
      target: venture.id,
      kind: "parent",
      relationType: null,
      note: null,
      weight: 1 + (descendants.get(venture.parentId) ?? 0),
      ...scoreOf(venture.id),
    });
  }

  for (const link of links) {
    if (!depths.has(link.fromVentureId) || !depths.has(link.toVentureId)) continue;
    edges.push({
      id: `rel:${link.id}`,
      source: link.fromVentureId,
      target: link.toVentureId,
      kind: "relation",
      relationType: link.relationType,
      note: link.note,
      weight: 1,
      ...scoreOf(link.toVentureId),
    });
  }

  // 末端节点收敛到目标锚
  const hasChild = new Set(
    ventures
      .map((venture) => venture.parentId)
      .filter((parentId): parentId is string => parentId !== null && parentId !== ""),
  );
  const leaves = ventures.filter((venture) => !hasChild.has(venture.id));

  nodes.push({
    id: TARGET_ANCHOR_ID,
    title: TARGET_ANCHOR_TITLE,
    status: "anchor",
    tags: [],
    depth: maxDepth + 1,
    x: (maxDepth + 1) * GAP_X,
    y: 0,
    score: null,
    trend: null,
    isAnchor: true,
    parentId: null,
    createdAt: null,
  });

  for (const leaf of leaves) {
    edges.push({
      id: `anchor:${leaf.id}`,
      source: leaf.id,
      target: TARGET_ANCHOR_ID,
      kind: "anchor",
      relationType: null,
      note: null,
      weight: 1,
      ...scoreOf(leaf.id),
    });
  }

  // 起点节点（视觉入口）
  const rootYs = nodes.filter((node) => node.depth === 0).map((node) => node.y);
  const originY = rootYs.length === 0 ? 0 : Math.round(rootYs.reduce((sum, value) => sum + value, 0) / rootYs.length);
  nodes.push({
    id: ORIGIN_ID,
    title: ORIGIN_TITLE,
    status: "origin",
    tags: [],
    depth: -1,
    x: -GAP_X,
    y: originY,
    score: null,
    trend: null,
    isAnchor: false,
    parentId: null,
    createdAt: null,
  });

  return { nodes, edges, maxDepth };
}