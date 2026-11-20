// modules/venture-grid/db/repos/score.repo.ts
/**
 * 分数记录 append-only：本类刻意不提供 update / delete。
 * trend 在写入时由 domain/trend.computeTrend 固化。
 */
import type { Db } from "../database";
import type { ScoreRecord, Trend } from "../../domain/types";
import { parseStringArray } from "./mappers";

type ScoreRow = {
  id: string;
  venture_id: string;
  batch_id: string;
  score: number;
  comment: string;
  trend: string;
  evidence_refs_json: string;
  created_at: string;
};

export function toScore(row: ScoreRow): ScoreRecord {
  return {
    id: row.id,
    ventureId: row.venture_id,
    batchId: row.batch_id,
    score: row.score,
    comment: row.comment,
    trend: row.trend as Trend,
    evidenceRefs: parseStringArray(row.evidence_refs_json),
    createdAt: row.created_at,
  };
}

export class ScoreRepo {
  constructor(private readonly db: Db) {}

  listByVenture(ventureId: string): ScoreRecord[] {
    const rows = this.db
      .query("SELECT * FROM vg_score WHERE venture_id = ? ORDER BY created_at ASC, id ASC")
      .all(ventureId) as ScoreRow[];
    return rows.map(toScore);
  }

  listByBatch(batchId: string): ScoreRecord[] {
    const rows = this.db
      .query("SELECT * FROM vg_score WHERE batch_id = ? ORDER BY created_at ASC, id ASC")
      .all(batchId) as ScoreRow[];
    return rows.map(toScore);
  }

  listAll(): ScoreRecord[] {
    const rows = this.db
      .query("SELECT * FROM vg_score ORDER BY created_at ASC, id ASC")
      .all() as ScoreRow[];
    return rows.map(toScore);
  }

  latestFor(ventureId: string): ScoreRecord | null {
    const row = this.db
      .query("SELECT * FROM vg_score WHERE venture_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
      .get(ventureId) as ScoreRow | null;
    return row === null ? null : toScore(row);
  }

  /** 每个 Venture 的最新一条分数（图谱/列表用）。 */
  latestAll(): Map<string, ScoreRecord> {
    const rows = this.db
      .query(
        `SELECT * FROM vg_score WHERE id IN (
           SELECT id FROM vg_score s1
           WHERE s1.created_at = (SELECT MAX(s2.created_at) FROM vg_score s2 WHERE s2.venture_id = s1.venture_id)
         )`,
      )
      .all() as ScoreRow[];
    const out = new Map<string, ScoreRecord>();
    for (const row of rows) {
      const record = toScore(row);
      const existing = out.get(record.ventureId);
      if (existing === undefined || existing.createdAt <= record.createdAt) {
        out.set(record.ventureId, record);
      }
    }
    return out;
  }

  /**
   * 指定批次之前最近一条分数。
   * 口径：按**批次的开始时间**比较（不是按打分记录的写入时间），
   * 否则同批次内后写的分数会被误当成「上一批」，趋势永远持平。
   */
  previousBefore(ventureId: string, currentBatchStartAt: string): number | null {
    const row = this.db
      .query(
        `SELECT s.score AS score
         FROM vg_score s
         JOIN vg_batch b ON b.id = s.batch_id
         WHERE s.venture_id = ? AND b.start_at < ?
         ORDER BY b.start_at DESC, s.created_at DESC, s.id DESC
         LIMIT 1`,
      )
      .get(ventureId, currentBatchStartAt) as { score: number } | null;
    return row === null ? null : row.score;
  }

  insert(input: {
    id: string;
    ventureId: string;
    batchId: string;
    score: number;
    comment: string;
    trend: Trend;
    evidenceRefs: string[];
    at: string;
  }): ScoreRecord {
    this.db
      .query(
        `INSERT INTO vg_score
          (id, venture_id, batch_id, score, comment, trend, evidence_refs_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.ventureId,
        input.batchId,
        input.score,
        input.comment,
        input.trend,
        JSON.stringify(input.evidenceRefs),
        input.at,
      );
    const created = this.latestFor(input.ventureId);
    if (created === null) throw new Error(`分数写入失败：${input.id}`);
    return created;
  }
}