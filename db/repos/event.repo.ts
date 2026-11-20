// modules/venture-grid/db/repos/event.repo.ts
/** 事件表只 INSERT：时间轴、周报、审计三处共用同一条事实源。 */
import type { Db } from "../database";
import type { EventKind, VgEvent } from "../../domain/types";
import { parseObject } from "./mappers";

type EventRow = {
  id: string;
  kind: string;
  venture_id: string | null;
  batch_id: string | null;
  payload_json: string;
  actor: string;
  at: string;
};

export function toEvent(row: EventRow): VgEvent {
  return {
    id: row.id,
    kind: row.kind as EventKind,
    ventureId: row.venture_id,
    batchId: row.batch_id,
    payload: parseObject(row.payload_json),
    actor: row.actor,
    at: row.at,
  };
}

export class EventRepo {
  constructor(private readonly db: Db) {}

  append(input: {
    id: string;
    kind: EventKind;
    ventureId?: string | null;
    batchId?: string | null;
    payload?: Record<string, unknown>;
    actor?: string;
    at: string;
  }): VgEvent {
    this.db
      .query(
        `INSERT INTO vg_event (id, kind, venture_id, batch_id, payload_json, actor, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.kind,
        input.ventureId ?? null,
        input.batchId ?? null,
        JSON.stringify(input.payload ?? {}),
        input.actor ?? "admin",
        input.at,
      );
    const row = this.db.query("SELECT * FROM vg_event WHERE id = ?").get(input.id) as EventRow | null;
    if (row === null) throw new Error(`事件写入失败：${input.id}`);
    return toEvent(row);
  }

  list(range: { from?: string; to?: string; limit?: number } = {}): VgEvent[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (range.from !== undefined) {
      clauses.push("at >= ?");
      params.push(range.from);
    }
    if (range.to !== undefined) {
      clauses.push("at <= ?");
      params.push(range.to);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(range.limit ?? 500, 5000));
    const rows = this.db
      .query(`SELECT * FROM vg_event ${where} ORDER BY at DESC, id DESC LIMIT ${limit}`)
      .all(...params) as EventRow[];
    return rows.map(toEvent);
  }

  listByBatch(batchId: string): VgEvent[] {
    const rows = this.db
      .query("SELECT * FROM vg_event WHERE batch_id = ? ORDER BY at ASC, id ASC")
      .all(batchId) as EventRow[];
    return rows.map(toEvent);
  }

  count(kind?: EventKind): number {
    const row =
      kind === undefined
        ? (this.db.query("SELECT COUNT(*) AS n FROM vg_event").get() as { n: number })
        : (this.db.query("SELECT COUNT(*) AS n FROM vg_event WHERE kind = ?").get(kind) as { n: number });
    return row.n;
  }
}