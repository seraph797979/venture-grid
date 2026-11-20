// modules/venture-grid/tests/domain.test.ts
import { describe, expect, test } from "bun:test";
import { assembleBriefData, renderBriefMarkdown, TREND_MARK } from "../domain/brief";
import { buildGraph, computeDepths, GAP_X, TARGET_ANCHOR_ID } from "../domain/layout";
import { computeTrend } from "../domain/trend";
import { isoWeekInfo } from "../domain/week";
import { createSnapshot, remapSnapshot, validateSnapshot, SNAPSHOT_SCHEMA } from "../domain/snapshot";
import type {
  Batch,
  Evidence,
  ScoreRecord,
  Venture,
  VentureLink,
  VgEvent,
} from "../domain/types";

const venture = (id: string, overrides: Partial<Venture> = {}): Venture => ({
  id,
  title: id,
  summary: "",
  hypothesis: "",
  parentId: null,
  status: "active",
  tags: [],
  forkOrigin: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const batch = (overrides: Partial<Batch> = {}): Batch => ({
  id: "b1",
  name: "Week 2026-W47",
  startTime: "2026-11-16T00:00:00.000Z",
  endTime: "2026-11-22T23:59:59.999Z",
  status: "open",
  briefStatus: "pending",
  briefContent: "",
  briefError: null,
  adminNote: "",
  createdAt: "2026-11-16T00:00:00.000Z",
  updatedAt: "2026-11-16T00:00:00.000Z",
  ...overrides,
});

const score = (id: string, ventureId: string, value: number, trend: ScoreRecord["trend"] = "flat"): ScoreRecord => ({
  id,
  ventureId,
  batchId: "b1",
  score: value,
  comment: "c",
  trend,
  evidenceRefs: [],
  createdAt: "2026-11-17T00:00:00.000Z",
});

const evidence = (id: string, ventureId: string): Evidence => ({
  id,
  ventureId,
  sourceTitle: `src-${id}`,
  sourceUrl: null,
  abstract: `abstract-${id}`,
  abstractSource: "llm",
  tags: [],
  documentId: null,
  addedAt: "2026-11-17T00:00:00.000Z",
});

const link = (id: string, from: string, to: string): VentureLink => ({
  id,
  fromVentureId: from,
  toVentureId: to,
  relationType: "support",
  note: null,
  createdAt: "2026-11-17T00:00:00.000Z",
});

const event = (id: string, kind: VgEvent["kind"], ventureId: string | null, payload: Record<string, unknown> = {}): VgEvent => ({
  id,
  kind,
  ventureId,
  batchId: "b1",
  payload,
  actor: "admin",
  at: `2026-11-17T00:00:0${id.length % 10}.000Z`,
});

describe("trend", () => {
  test("三态 + 无基准 + 浮点噪声", () => {
    expect(computeTrend(60, 50)).toBe("up");
    expect(computeTrend(50, 60)).toBe("down");
    expect(computeTrend(50, 50)).toBe("flat");
    expect(computeTrend(50, null)).toBe("flat");
    expect(computeTrend(50, undefined)).toBe("flat");
    expect(computeTrend(50.001, 50)).toBe("flat");
  });
});

describe("layout", () => {
  test("深度由 parent 链决定，环不炸", () => {
    const depths = computeDepths([
      venture("root"),
      venture("child", { parentId: "root" }),
      venture("grand", { parentId: "child" }),
      venture("cyc1", { parentId: "cyc2" }),
      venture("cyc2", { parentId: "cyc1" }),
    ]);
    expect(depths.get("root")).toBe(0);
    expect(depths.get("child")).toBe(1);
    expect(depths.get("grand")).toBe(2);
    expect(depths.get("cyc1")).toBeGreaterThanOrEqual(0);
  });

  test("x 按深度、末端收敛到目标锚、关系边保留类型", () => {
    const graph = buildGraph({
      ventures: [
        venture("a"),
        venture("b", { parentId: "a" }),
        venture("c", { parentId: "b" }),
        venture("d"),
      ],
      links: [link("l1", "b", "d")],
      latestScores: new Map([["b", { score: 61, trend: "up" as const }]]),
    });
    const a = graph.nodes.find((node) => node.id === "a");
    const c = graph.nodes.find((node) => node.id === "c");
    const anchor = graph.nodes.find((node) => node.id === TARGET_ANCHOR_ID);
    expect(a?.x).toBe(0);
    expect(c?.x).toBe(2 * GAP_X);
    expect(anchor?.isAnchor).toBe(true);
    expect(graph.nodes.find((node) => node.id === "b")?.score).toBe(61);
    const relation = graph.edges.find((edge) => edge.id === "rel:l1");
    expect(relation?.relationType).toBe("support");
    // 线宽 = 1 + 子树体量：a 有 b、c 两个后代 → 3；b 有 c → 2
    expect(graph.edges.find((edge) => edge.id === "parent:a->b")?.weight).toBe(3);
    expect(graph.edges.find((edge) => edge.id === "parent:b->c")?.weight).toBe(2);
    expect(graph.edges.some((edge) => edge.kind === "anchor" && edge.source === "c")).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "anchor" && edge.source === "a")).toBe(false);
  });
});

describe("brief", () => {
  test("四类事件聚合 + Markdown 段落齐全", () => {
    const data = assembleBriefData({
      batch: batch({ adminNote: "人工综述" }),
      ventures: [venture("v1", { title: "A" }), venture("v2", { title: "B" })],
      events: [
        event("e1", "venture_added", "v1"),
        event("e2", "score_changed", "v1"),
        event("e3", "evidence_added", "v1", { evidenceId: "ev1" }),
        event("e4", "link_added", "v1", { linkId: "l1" }),
      ],
      scores: [score("s1", "v1", 70, "up")],
      previousScores: new Map([["v1", 60]]),
      evidences: [evidence("ev1", "v1")],
      links: [link("l1", "v1", "v2")],
    });
    expect(data.added).toHaveLength(1);
    expect(data.scoreChanges[0]?.previousScore).toBe(60);
    expect(data.evidences).toHaveLength(1);
    expect(data.links).toHaveLength(1);

    const md = renderBriefMarkdown(data, { narrative: "模型综述段落" });
    for (const heading of [
      "## 本周新增",
      "## 分数变动",
      "## 新增证据",
      "## 新增关联",
      "## 本周综述（模型生成）",
      "## 管理员综述",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("60 → 70");
    expect(md).toContain(`${TREND_MARK.up} up`);
    expect(md).toContain("人工综述");
    expect(md).toContain("模型综述段落");
  });

  test("空数据也保留四段，不静默省略", () => {
    const md = renderBriefMarkdown(
      assembleBriefData({
        batch: batch(),
        ventures: [],
        events: [],
        scores: [],
        previousScores: new Map(),
        evidences: [],
        links: [],
      }),
    );
    expect(md.match(/（无）/g)?.length).toBe(5);
  });
});

describe("snapshot", () => {
  const source = {
    ventures: [venture("v1"), venture("v2", { parentId: "v1" })],
    evidences: [evidence("ev1", "v1")],
    links: [link("l1", "v1", "v2")],
    scores: [{ ...score("s1", "v1", 70), evidenceRefs: ["ev1"] }],
    batches: [batch()],
    documents: [],
  };

  test("导出子集裁剪", () => {
    const snapshot = createSnapshot(source, {
      snapshotId: "snap1",
      exportedAt: "2026-11-19T00:00:00.000Z",
      sourceInstance: "src",
      ventureIds: ["v2"],
    });
    expect(snapshot.ventures.map((item) => item.id)).toEqual(["v2"]);
    expect(snapshot.links).toHaveLength(0); // 端点不在子集
    expect(snapshot.evidences).toHaveLength(0);
  });

  test("导入重新生成 id、forkOrigin 标注、父子与关联重建", () => {
    const snapshot = createSnapshot(source, {
      snapshotId: "snap1",
      exportedAt: "2026-11-19T00:00:00.000Z",
      sourceInstance: "src",
    });
    let n = 0;
    const plan = remapSnapshot(snapshot, {
      targetLabel: "dst",
      now: "2026-11-19T01:00:00.000Z",
      newId: (prefix) => `${prefix}_i${++n}`,
    });
    expect(plan.forkOrigin).toBe("dst@snap1");
    expect(plan.ventures).toHaveLength(2);
    expect(plan.ventures.every((item) => item.forkOrigin === "dst@snap1")).toBe(true);
    const child = plan.ventures.find((item) => item.title === "v2");
    const parent = plan.ventures.find((item) => item.title === "v1");
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(child?.parentId).toBe(parent!.id);
    expect(plan.links[0]?.fromVentureId).toBe(parent!.id);
    expect(plan.scores[0]?.batchId).toBe(plan.batches[0]!.id);
    expect(plan.scores[0]?.evidenceRefs).toEqual([plan.evidences[0]!.id]);
  });

  test("结构校验", () => {
    expect(validateSnapshot({ schema: SNAPSHOT_SCHEMA, snapshotId: "x", sourceInstance: "s", ventures: [], evidences: [], links: [], scores: [], batches: [], documents: [] }).ok).toBe(true);
    expect(validateSnapshot({ schema: "other" }).ok).toBe(false);
    expect(validateSnapshot(null).ok).toBe(false);
  });
});

describe("iso week", () => {
  test("周一/周日边界与批次名", () => {
    const info = isoWeekInfo(new Date("2026-11-16T00:00:00.000Z"));
    expect(info.key).toBe("2026-W47");
    expect(info.name).toBe("Week 2026-W47");
    expect(info.startIso).toBe("2026-11-16T00:00:00.000Z");
    expect(info.endIso.startsWith("2026-11-22")).toBe(true);
  });
});