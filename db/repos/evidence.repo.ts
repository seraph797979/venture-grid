// modules/venture-grid/db/repos/evidence.repo.ts
import type { Db } from "../database";
import type { AbstractSource, Evidence } from "../../domain/types";
import { parseStringArray } from "./mappers";

type EvidenceRow = {
  id: string;
  venture_id: string;
  source_title: string;
  source_url: string | null;
  abstract: string;
  abstract_source: string;
  tags_json: string;
  document_id: string | null;
  added_at: string;
};

export function toEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    ventureId: row.venture_id,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    abstract: row.abstract,
    abstractSource: row.abstract_source as AbstractSource,
    tags: parseStringArray(row.tags_json),
    documentId: row.document_id,
    addedAt: row.added_at,
  };
}

export type CreateEvidenceRow = {
  id: string;
  ventureId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  abstract: string;
  abstractSource: AbstractSource;
  tags: string[];
  documentId: string | null;
  at: string;
};

export class EvidenceRepo {
  constructor(private readonly db: Db) {}

  listByVenture(ventureId: string): Evidence[] {
    const rows = this.db
      .query("SELECT * FROM vg_evidence WHERE venture_id = ? ORDER BY added_at DESC, id DESC")
      .all(ventureId) as EvidenceRow[];
    return rows.map(toEvidence);
  }

  listAll(): Evidence[] {
    const rows = this.db
      .query("SELECT * FROM vg_evidence ORDER BY added_at ASC, id ASC")
      .all() as EvidenceRow[];
    return rows.map(toEvidence);
  }

  listByIds(ids: string[]): Evidence[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db
      .query(`SELECT * FROM vg_evidence WHERE id IN (${placeholders})`)
      .all(...ids) as EvidenceRow[];
    return rows.map(toEvidence);
  }

  get(id: string): Evidence | null {
    const row = this.db.query("SELECT * FROM vg_evidence WHERE id = ?").get(id) as EvidenceRow | null;
    return row === null ? null : toEvidence(row);
  }

  insert(input: CreateEvidenceRow): Evidence {
    this.db
      .query(
        `INSERT INTO vg_evidence
          (id, venture_id, source_title, source_url, abstract, abstract_source, tags_json, document_id, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.ventureId,
        input.sourceTitle,
        input.sourceUrl,
        input.abstract,
        input.abstractSource,
        JSON.stringify(input.tags),
        input.documentId,
        input.at,
      );
    const created = this.get(input.id);
    if (created === null) throw new Error(`证据写入失败：${input.id}`);
    return created;
  }

  updateAbstract(id: string, abstract: string): Evidence | null {
    this.db
      .query("UPDATE vg_evidence SET abstract = ?, abstract_source = 'admin_edited' WHERE id = ?")
      .run(abstract, id);
    return this.get(id);
  }
}