// modules/venture-grid/ui/src/components/GraphCanvas.tsx
/**
 * 左→右流束图谱。
 * - 曲线（贝塞尔）代替折线，粗细 = 评分，颜色 = 趋势
 * - 节点只画小圆点，名称在悬停时浮出；不画方块标签
 * - 起点实心青绿圆、终点虚线圆锚；点击连线显示关系文字，点击圆点打开详情
 */
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { GraphEdge, GraphNode } from "../../../domain/layout";
import { t } from "../i18n";

type NodeData = {
  title: string;
  status: string;
  score: number | null;
};

type EdgeData = {
  label: string;
  note: string | null;
  show: boolean;
  color: string;
  width: number;
  halo: boolean;
  rel: boolean;
};

const RELATION_COLOR: Record<string, string> = {
  support: "#3f8f6b",
  contradict: "#b4692f",
  depend: "#3b6f95",
  parallel: "#9aa7b4",
};

const STATUS_COLOR: Record<string, string> = {
  active: "#2c8d94",
  suspended: "#d7b45a",
  closed: "#aab4bf",
};

const HIDDEN_HANDLE = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
} as const;

const DOT_HANDLE = {
  ...HIDDEN_HANDLE,
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
} as const;

function mixHex(from: string, to: string, ratio: number): string {
  const parse = (hex: string): [number, number, number] => {
    const value = hex.replace("#", "");
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ];
  };
  const a = parse(from);
  const b = parse(to);
  const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
  const channels = a.map((channel, index) => clamp(channel + (b[index]! - channel) * ratio));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** 颜色 = 趋势 × 分数强度 */
function flowColor(edge: GraphEdge): string {
  if (edge.kind === "relation" && edge.relationType !== null) {
    return RELATION_COLOR[edge.relationType] ?? "#9aa7b4";
  }
  const base = edge.score === null ? 0.5 : edge.score / 100;
  const trendBonus = edge.trend === "up" ? 0.14 : edge.trend === "down" ? -0.14 : 0;
  const intensity = Math.max(0.1, Math.min(1, base + trendBonus));
  return mixHex("#bfe3de", "#1f7f86", intensity);
}

function flowWidth(edge: GraphEdge): number {
  if (edge.kind === "anchor") return 1.6;
  if (edge.kind === "relation") return 1;
  if (edge.score === null) return 3;
  return 2.6 + Math.max(0, Math.min(100, edge.score)) / 11;
}

function flowOpacity(edge: GraphEdge): number {
  if (edge.kind === "relation") return 0.45;
  if (edge.kind === "anchor") return 0.5;
  if (edge.score === null) return 0.42;
  return Math.max(0.34, Math.min(0.95, 0.34 + edge.score / 160));
}

function dotSize(score: number | null): number {
  if (score === null) return 12;
  return Math.round(12 + (Math.max(0, Math.min(100, score)) / 100) * 6);
}

function DotNode({ data }: NodeProps) {
  const node = data as unknown as NodeData;
  const color = STATUS_COLOR[node.status] ?? STATUS_COLOR.active;
  const label = node.title;
  const size = dotSize(node.score);
  return (
    <div className="vg-dot" data-label={label} aria-label={label}>
      <Handle type="target" position={Position.Left} style={DOT_HANDLE} />
      <span
        className="dot-core"
        style={{ background: color, width: size, height: size }}
      />
      <Handle type="source" position={Position.Right} style={DOT_HANDLE} />
    </div>
  );
}

function OriginNode() {
  return (
    <div className="vg-origin" title={t("graph.origin")}>
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
      <span>{t("graph.origin")}</span>
    </div>
  );
}

function AnchorNode() {
  return (
    <div className="vg-anchor" title={t("graph.anchorSub")}>
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <span className="a-title">{t("graph.anchorTitleShort")}</span>
    </div>
  );
}

function VgEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const edge = data as unknown as EdgeData | undefined;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: edge?.rel === true ? 0.18 : edge?.halo === true ? 0.72 : 0.5,
  });
  return (
    <>
      {edge?.halo === true && (
        <path
          d={path}
          fill="none"
          stroke={edge.color}
          strokeWidth={edge.width + 9}
          strokeOpacity={0.09}
          strokeLinecap="round"
        />
      )}
      <BaseEdge id={id} path={path} style={{ ...style, strokeLinecap: "round" }} interactionWidth={26} />
      {edge?.show === true && (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <strong>{edge.label}</strong>
            {edge.note !== null && edge.note !== "" && <span>{edge.note}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { venture: DotNode, origin: OriginNode, anchor: AnchorNode };
const edgeTypes = { vg: VgEdge };

export type GraphCanvasProps = {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  onSelect?: (id: string) => void;
  showRelations?: boolean;
  showScores?: boolean;
  foldedDepth?: number;
  heightClass?: string;
  /** 图上最多显示多少个 venture（默认 10） */
  maxVentures?: number;
};

export function GraphCanvas({
  graph,
  onSelect,
  showRelations = false,
  showScores = true,
  foldedDepth,
  heightClass = "",
  maxVentures = 10,
}: GraphCanvasProps) {
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<{ id: string; title: string; x: number; y: number } | null>(null);
  const hideTimer = useRef<number | null>(null);

  const clearHide = (): void => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const showTip = (event: ReactMouseEvent, node: Node): void => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    clearHide();
    const data = node.data as unknown as NodeData;
    setTip({
      id: node.id,
      title: data.title,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };
  const scheduleHide = (): void => {
    clearHide();
    hideTimer.current = window.setTimeout(() => setTip(null), 180);
  };

  const visible = useMemo(() => {
    const depthLimited = graph.nodes.filter((node) => {
      if (node.status === "origin" || node.isAnchor) return true;
      return foldedDepth === undefined || node.depth <= foldedDepth;
    });

    const ventures = depthLimited.filter((node) => !node.isAnchor && node.status !== "origin");
    const ordered = [...ventures].sort(
      (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.depth - b.depth || a.y - b.y,
    );
    let picked = ordered.slice(0, Math.max(0, maxVentures));

    // 父节点被截掉的子节点一并去掉，保证每条分支都能连回起点
    let changed = true;
    while (changed) {
      changed = false;
      const pickedIds = new Set(picked.map((node) => node.id));
      const next = picked.filter(
        (node) => node.parentId === null || node.parentId === "" || pickedIds.has(node.parentId),
      );
      if (next.length !== picked.length) {
        picked = next;
        changed = true;
      }
    }

    const pickedIds = new Set(picked.map((node) => node.id));
    const nodes = depthLimited.filter(
      (node) => node.isAnchor || node.status === "origin" || pickedIds.has(node.id),
    );
    const ids = new Set(nodes.map((node) => node.id));

    const edges = graph.edges.filter(
      (edge) =>
        ids.has(edge.source) &&
        ids.has(edge.target) &&
        (showRelations || edge.kind !== "relation"),
    );
    return { nodes, edges };
  }, [graph, foldedDepth, showRelations, maxVentures]);

  const nodes: Node[] = useMemo(
    () =>
      visible.nodes.map((node) => {
        const isDot = node.status !== "origin" && !node.isAnchor;
        return {
          id: node.id,
          type: node.isAnchor ? "anchor" : node.status === "origin" ? "origin" : "venture",
          position: {
            x: node.x - (node.isAnchor ? 75 : node.status === "origin" ? 29 : isDot ? 50 : 0),
            y: node.y * 1.8 - (node.isAnchor ? 75 : node.status === "origin" ? 29 : isDot ? 50 : 0),
          },
          data: {
            title: node.title,
            status: node.status,
            score: showScores ? node.score : null,
          },
          draggable: false,
          selectable: false,
        };
      }),
    [visible.nodes, showScores],
  );

  const edges: Edge[] = useMemo(
    () =>
      visible.edges.map((edge) => {
        const color = flowColor(edge);
        const width = flowWidth(edge);
        const label =
          edge.kind === "origin"
            ? t("graph.edgeOrigin")
            : edge.kind === "parent"
              ? t("graph.edgeBranch")
              : edge.kind === "anchor"
                ? t("graph.edgeAnchor")
                : edge.relationType === null
                ? t("graph.legendRelation")
                : t(`relation.${edge.relationType}`);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "vg",
          data: {
            label,
            note: edge.kind === "relation" ? edge.note : null,
            show: selectedEdge === edge.id,
            color,
            width,
            halo: edge.kind === "parent" || edge.kind === "origin",
            rel: edge.kind === "relation",
          },
          style: {
            stroke: color,
            strokeWidth: width,
            strokeDasharray: edge.kind === "anchor" || edge.relationType === "parallel" ? "6 6" : undefined,
            opacity: flowOpacity(edge),
          },
        };
      }),
    [visible.edges, selectedEdge],
  );

  return (
    <div className={`graph-shell ${heightClass}`} ref={shellRef}>
      <ReactFlow
        key={`${visible.nodes.length}:${visible.edges.length}:${foldedDepth ?? "all"}:${showRelations ? 1 : 0}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.05 }}
        minZoom={0.16}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_event, node) => {
          if (node.type === "anchor" || node.type === "origin") return;
          onSelect?.(node.id);
        }}
        onNodeMouseEnter={(event, node) => {
          if (node.type === "venture") showTip(event, node);
        }}
        onNodeMouseLeave={() => scheduleHide()}
        onEdgeClick={(_event, edge) => {
          setSelectedEdge((current) => (current === edge.id ? null : edge.id));
        }}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={24} size={1.2} color="#cfd9e1" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {tip !== null && (
        <button
          type="button"
          className="dot-tip"
          style={{ left: tip.x, top: tip.y }}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
          onClick={() => {
            setTip(null);
            onSelect?.(tip.id);
          }}
        >
          {tip.title}
        </button>
      )}
    </div>
  );
}