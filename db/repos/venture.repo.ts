// modules/venture-grid/db/repos/venture.repo.ts
import type { Db } from "../database";
import type { Venture, VentureStatus } from "../../domain/types";
import { parseStringArray } from "./mappers";

type VentureRow = {
  id: string;
  title: string;
  summary: string;
  hypothesis: string;
  parent_id: string | null;
  status: string;
  tags_json: string;
  fork_origin: string | null;
  created_at: string;
  updated_at: string;
};

export function toVenture(row: VentureRow): Venture {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    hypothesis: row.hypothesis,
    parentId: row.parent_id,
    status: row.status as VentureStatus,
    tags: parseStringArray(row.tags_json),
    forkOrigin: row.fork_origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreateVentureRow = {
  id: string;
  title: string;
  summary: string;
  hypothesis: string;
  parentId: string | null;
  status: VentureStatus;
  tags: string[];
  forkOrigin: string | null;
  at: string;
};

export type UpdateVenturePatch = {
  title?: string;
  summary?: string;
  hypothesis?: string;
  status?: VentureStatus;
  tags?: string[];
};

export type VentureFilter = {
  status?: VentureStatus;
  tag?: string;
  /** 只保留在该批次内有打分记录的 Venture */
  batchId?: string;
};

export class VentureRepo {
  constructor(private readonly db: Db) {}

  list(filter: VentureFilter = {}): Venture[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter.status !== undefined) {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    if (filter.tag !== undefined && filter.tag !== "") {
      clauses.push("EXISTS (SELECT 1 FROM json_each(vg_venture.tags_json) WHERE json_each.value = ?)");
      params.push(filter.tag);
    }
    if (filter.batchId !== undefined && filter.batchId !== "") {
      clauses.push("EXISTS (SELECT 1 FROM vg_score s WHERE s.venture_id = vg_venture.id AND s.batch_id = ?)");
      params.push(filter.batchId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .query(`SELECT * FROM vg_venture ${where} ORDER BY created_at ASC, id ASC`)
      .all(...params) as VentureRow[];
    return rows.map(toVenture);
  }

  get(id: string): Venture | null {
    const row = this.db.query("SELECT * FROM vg_venture WHERE id = ?").get(id) as VentureRow | null;
    return row === null ? null : toVenture(row);
  }

  children(id: string): Venture[] {
    const rows = this.db
      .query("SELECT * FROM vg_venture WHERE parent_id = ? ORDER BY created_at ASC, id ASC")
      .all(id) as VentureRow[];
    return rows.map(toVenture);
  }

  insert(input: CreateVentureRow): Venture {
    this.db
      .query(
        `INSERT INTO vg_venture
          (id, title, summary, hypothesis, parent_id, status, tags_json, fork_origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.title,
        input.summary,
        input.hypothesis,
        input.parentId,
        input.status,
        JSON.stringify(input.tags),
        input.forkOrigin,
        input.at,
        input.at,
      );
    const created = this.get(input.id);
    if (created === null) throw new Error(`Venture 写入失败：${input.id}`);
    return created;
  }

  update(id: string, patch: UpdateVenturePatch, at: string): Venture | null {
    const sets: string[] = [];
    const params: Array<string | null> = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(patch.title);
    }
    if (patch.summary !== undefined) {
      sets.push("summary = ?");
      params.push(patch.summary);
    }
    if (patch.hypothesis !== undefined) {
      sets.push("hypothesis = ?");
      params.push(patch.hypothesis);
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      params.push(patch.status);
    }
    if (patch.tags !== undefined) {
      sets.push("tags_json = ?");
      params.push(JSON.stringify(patch.tags));
    }
    if (sets.length === 0) return this.get(id);
    sets.push("updated_at = ?");
    params.push(at);
    params.push(id);
    this.db.query(`UPDATE vg_venture SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    return this.get(id);
  }

  countByStatus(): Record<VentureStatus, number> {
    const rows = this.db
      .query("SELECT status, COUNT(*) AS n FROM vg_venture GROUP BY status")
      .all() as Array<{ status: string; n: number }>;
    const out: Record<VentureStatus, number> = { active: 0, suspended: 0, closed: 0 };
    for (const row of rows) {
      if (row.status === "active" || row.status === "suspended" || row.status === "closed") {
        out[row.status] = row.n;
      }
    }
    return out;
  }

  count(): number {
    const row = this.db.query("SELECT COUNT(*) AS n FROM vg_venture").get() as { n: number };
    return row.n;
  }
}