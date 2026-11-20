// modules/venture-grid/db/repos/batch.repo.ts
import type { Db } from "../database";
import type { Batch, BatchStatus, BriefStatus } from "../../domain/types";
import { isoWeekInfo } from "../../domain/week";

type BatchRow = {
  id: string;
  name: string;
  start_at: string;
  end_at: string;
  status: string;
  brief_status: string;
  brief_content: string;
  brief_error: string | null;
  admin_note: string;
  created_at: string;
  updated_at: string;
};

export function toBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_at,
    endTime: row.end_at,
    status: row.status as BatchStatus,
    briefStatus: row.brief_status as BriefStatus,
    briefContent: row.brief_content,
    briefError: row.brief_error,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BatchRepo {
  constructor(private readonly db: Db) {}

  list(): Batch[] {
    const rows = this.db
      .query("SELECT * FROM vg_batch ORDER BY start_at DESC, id DESC")
      .all() as BatchRow[];
    return rows.map(toBatch);
  }

  get(id: string): Batch | null {
    const row = this.db.query("SELECT * FROM vg_batch WHERE id = ?").get(id) as BatchRow | null;
    return row === null ? null : toBatch(row);
  }

  getByName(name: string): Batch | null {
    const row = this.db.query("SELECT * FROM vg_batch WHERE name = ?").get(name) as BatchRow | null;
    return row === null ? null : toBatch(row);
  }

  /** 当前 ISO 周的批次；不存在则创建。 */
  ensureCurrent(id: string, now: string): Batch {
    const info = isoWeekInfo(new Date(now));
    const existing = this.getByName(info.name);
    if (existing !== null) return existing;
    this.db
      .query(
        `INSERT INTO vg_batch (id, name, start_at, end_at, status, brief_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', 'pending', ?, ?)`,
      )
      .run(id, info.name, info.startIso, info.endIso, now, now);
    const created = this.get(id);
    if (created === null) throw new Error(`批次写入失败：${id}`);
    return created;
  }

  create(input: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    status?: BatchStatus;
    at: string;
  }): Batch {
    this.db
      .query(
        `INSERT INTO vg_batch (id, name, start_at, end_at, status, brief_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(input.id, input.name, input.startTime, input.endTime, input.status ?? "open", input.at, input.at);
    const created = this.get(input.id);
    if (created === null) throw new Error(`批次写入失败：${input.id}`);
    return created;
  }

  updateBrief(
    id: string,
    patch: {
      status: BriefStatus;
      content?: string;
      error?: string | null;
    },
    at: string,
  ): Batch | null {
    this.db
      .query(
        `UPDATE vg_batch
         SET brief_status = ?, brief_content = COALESCE(?, brief_content), brief_error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(patch.status, patch.content ?? null, patch.error ?? null, at, id);
    return this.get(id);
  }

  updateNote(id: string, note: string, at: string): Batch | null {
    this.db.query("UPDATE vg_batch SET admin_note = ?, updated_at = ? WHERE id = ?").run(note, at, id);
    return this.get(id);
  }

  close(id: string, at: string): Batch | null {
    this.db
      .query("UPDATE vg_batch SET status = 'closed', updated_at = ? WHERE id = ?")
      .run(at, id);
    return this.get(id);
  }

  /** 历史批次里最近一个已关闭且有周报的批次（周报页默认展示）。 */
  latestReady(): Batch | null {
    const row = this.db
      .query("SELECT * FROM vg_batch WHERE brief_status = 'ready' ORDER BY start_at DESC LIMIT 1")
      .get() as BatchRow | null;
    return row === null ? null : toBatch(row);
  }
}