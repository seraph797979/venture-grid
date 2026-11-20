// modules/venture-grid/db/repos/run.repo.ts
import type { Db } from "../database";
import type { RunStatus, VgRun } from "../../domain/types";
import { parseObject } from "./mappers";

type RunRow = {
  id: string;
  kind: string;
  batch_id: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  stats_json: string;
};

export function toRun(row: RunRow): VgRun {
  return {
    id: row.id,
    kind: row.kind,
    batchId: row.batch_id,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
    stats: parseObject(row.stats_json),
  };
}

export class RunRepo {
  constructor(private readonly db: Db) {}

  create(input: { id: string; kind: string; batchId: string | null; at: string }): VgRun {
    this.db
      .query("INSERT INTO vg_run (id, kind, batch_id, status, started_at) VALUES (?, ?, ?, 'running', ?)")
      .run(input.id, input.kind, input.batchId, input.at);
    const created = this.get(input.id);
    if (created === null) throw new Error(`运行记录写入失败：${input.id}`);
    return created;
  }

  finish(
    id: string,
    patch: { status: RunStatus; error?: string | null; stats?: Record<string, unknown>; at: string },
  ): VgRun | null {
    this.db
      .query("UPDATE vg_run SET status = ?, error = ?, stats_json = ?, finished_at = ? WHERE id = ?")
      .run(patch.status, patch.error ?? null, JSON.stringify(patch.stats ?? {}), patch.at, id);
    return this.get(id);
  }

  get(id: string): VgRun | null {
    const row = this.db.query("SELECT * FROM vg_run WHERE id = ?").get(id) as RunRow | null;
    return row === null ? null : toRun(row);
  }

  listByBatch(batchId: string): VgRun[] {
    const rows = this.db
      .query("SELECT * FROM vg_run WHERE batch_id = ? ORDER BY started_at DESC")
      .all(batchId) as RunRow[];
    return rows.map(toRun);
  }

  list(limit = 50): VgRun[] {
    const rows = this.db
      .query(`SELECT * FROM vg_run ORDER BY started_at DESC LIMIT ${Math.max(1, Math.min(limit, 500))}`)
      .all() as RunRow[];
    return rows.map(toRun);
  }
}