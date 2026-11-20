// modules/venture-grid/db/repos/link.repo.ts
import type { Db } from "../database";
import type { RelationType, VentureLink } from "../../domain/types";

type LinkRow = {
  id: string;
  from_venture_id: string;
  to_venture_id: string;
  relation_type: string;
  note: string | null;
  created_at: string;
};

export function toLink(row: LinkRow): VentureLink {
  return {
    id: row.id,
    fromVentureId: row.from_venture_id,
    toVentureId: row.to_venture_id,
    relationType: row.relation_type as RelationType,
    note: row.note,
    createdAt: row.created_at,
  };
}

export class LinkRepo {
  constructor(private readonly db: Db) {}

  listAll(): VentureLink[] {
    const rows = this.db.query("SELECT * FROM vg_link ORDER BY created_at ASC").all() as LinkRow[];
    return rows.map(toLink);
  }

  listForVenture(ventureId: string): VentureLink[] {
    const rows = this.db
      .query("SELECT * FROM vg_link WHERE from_venture_id = ? OR to_venture_id = ? ORDER BY created_at ASC")
      .all(ventureId, ventureId) as LinkRow[];
    return rows.map(toLink);
  }

  get(id: string): VentureLink | null {
    const row = this.db.query("SELECT * FROM vg_link WHERE id = ?").get(id) as LinkRow | null;
    return row === null ? null : toLink(row);
  }

  insert(input: {
    id: string;
    fromVentureId: string;
    toVentureId: string;
    relationType: RelationType;
    note: string | null;
    at: string;
  }): VentureLink {
    this.db
      .query(
        `INSERT INTO vg_link (id, from_venture_id, to_venture_id, relation_type, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.fromVentureId,
        input.toVentureId,
        input.relationType,
        input.note,
        input.at,
      );
    const created = this.get(input.id);
    if (created === null) throw new Error(`关联写入失败：${input.id}`);
    return created;
  }
}