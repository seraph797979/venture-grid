// modules/venture-grid/tests/service.test.ts
import { describe, expect, test } from "bun:test";
import { ServiceError } from "../services/vg-service";
import { createTestService, seedTwoBatches } from "./helpers";

describe("vg-service 业务不变量", () => {
  test("趋势按「上一批次」计算，而不是按写入时间", () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      const rootScores = ctx.service.scores.listByVenture(ids.rootId);
      const childScores = ctx.service.scores.listByVenture(ids.childId);
      expect(rootScores.map((item) => [item.score, item.trend])).toEqual([
        [60, "flat"],
        [66, "up"],
      ]);
      expect(childScores.map((item) => [item.score, item.trend])).toEqual([
        [50, "flat"],
        [44, "down"],
      ]);
    } finally {
      ctx.close();
    }
  });

  test("同批次重复打分 → 409，且不新增记录", () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      const before = ctx.service.scores.listAll().length;
      let error: unknown = null;
      try {
        ctx.service.addScore(ids.rootId, {
          score: 70,
          comment: "第二次",
          batchId: ids.currentBatchId,
        });
      } catch (reason) {
        error = reason;
      }
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).status).toBe(409);
      expect(ctx.service.scores.listAll().length).toBe(before);
    } finally {
      ctx.close();
    }
  });

  test("证据引用必须属于同一 Venture", () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      const evidenceOnChild = ctx.service.addEvidence(ids.childId, {
        sourceTitle: "child evidence",
        abstract: "摘要",
      });
      let error: unknown = null;
      try {
        ctx.service.addScore(ids.rootId, {
          score: 70,
          comment: "跨 Venture 引用",
          evidenceRefs: [evidenceOnChild.id],
          batchId: ids.currentBatchId,
        });
      } catch (reason) {
        error = reason;
      }
      expect((error as ServiceError).status).toBe(422);
    } finally {
      ctx.close();
    }
  });

  test("四类业务事件自动挂当前批次（周报聚合依赖它）", () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      const evidence = ctx.service.addEvidence(ids.rootId, {
        sourceTitle: "e",
        abstract: "摘要",
      });
      ctx.service.addLink({
        fromVentureId: ids.rootId,
        toVentureId: ids.childId,
        relationType: "support",
      });
      const events = ctx.service.events.listByBatch(ids.currentBatchId);
      const kinds = new Set(events.map((event) => event.kind));
      expect(kinds.has("venture_added")).toBe(true);
      expect(kinds.has("score_changed")).toBe(true);
      expect(kinds.has("evidence_added")).toBe(true);
      expect(kinds.has("link_added")).toBe(true);
      expect(events.some((event) => event.payload.evidenceId === evidence.id)).toBe(true);

      const brief = ctx.service.briefData(ids.currentBatchId);
      expect(brief.scoreChanges).toHaveLength(2);
      expect(brief.evidences).toHaveLength(1);
      expect(brief.links).toHaveLength(1);
    } finally {
      ctx.close();
    }
  });

  test("证据摘要为空时拒绝落库", () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      const before = ctx.service.evidences.listByVenture(ids.rootId).length;
      expect(() =>
        ctx.service.addEvidence(ids.rootId, { sourceTitle: "x", abstract: "   " }),
      ).toThrow();
      expect(ctx.service.evidences.listByVenture(ids.rootId).length).toBe(before);
    } finally {
      ctx.close();
    }
  });

  test("score 仓储没有 update / delete（append-only）", () => {
    const ctx = createTestService();
    try {
      const repo = ctx.service.scores as unknown as Record<string, unknown>;
      expect(typeof repo.update).toBe("undefined");
      expect(typeof repo.delete).toBe("undefined");
      expect(typeof repo.remove).toBe("undefined");
    } finally {
      ctx.close();
    }
  });

  test("状态变更留事件；批次名/slug 冲突返回 409", () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      ctx.service.updateVenture(ids.rootId, { status: "suspended" });
      expect(
        ctx.service.events
          .list({ limit: 50 })
          .some((event) => event.kind === "status_changed" && event.payload.to === "suspended"),
      ).toBe(true);

      expect(() =>
        ctx.service.createBatch({
          name: "Week 2026-W47",
          startTime: "2026-11-16T00:00:00.000Z",
          endTime: "2026-11-22T23:59:59.999Z",
        }),
      ).toThrow();

      ctx.service.createDocument({ slug: "guide", title: "G", kind: "guide", bodyMd: "# G" });
      expect(() =>
        ctx.service.createDocument({ slug: "guide", title: "G2", kind: "guide", bodyMd: "# G2" }),
      ).toThrow();
    } finally {
      ctx.close();
    }
  });

  test("快照导出/导入：forkOrigin、父子与关联完整", () => {
    const ctx = createTestService();
    try {
      const ids = seedTwoBatches(ctx.service);
      ctx.service.addLink({
        fromVentureId: ids.rootId,
        toVentureId: ids.childId,
        relationType: "depend",
      });
      const snapshot = ctx.service.exportSnapshot();
      expect(snapshot.schema).toBe("vg-snapshot@1");

      const result = ctx.service.importSnapshot(snapshot);
      expect(result.counts.ventures).toBe(2);
      expect(result.counts.links).toBeGreaterThanOrEqual(1);

      const all = ctx.service.ventures.list();
      const forked = all.filter((venture) => venture.forkOrigin !== null);
      expect(forked).toHaveLength(2);
      expect(forked[0]?.forkOrigin).toBe(`test-instance@${snapshot.snapshotId}`);

      const forkedRoot = forked.find((venture) => venture.parentId === null);
      const forkedChild = forked.find((venture) => venture.parentId !== null);
      expect(forkedChild?.parentId).toBe(forkedRoot?.id);
      const links = ctx.service.links.listAll();
      expect(links.length).toBe(2); // 原实例 1 条 + 导入 1 条
    } finally {
      ctx.close();
    }
  });
});