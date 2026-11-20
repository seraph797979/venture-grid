// modules/venture-grid/db/repos/document.repo.ts
import type { Db } from "../database";
import type { DocumentKind, VgDocument } from "../../domain/types";

type DocumentRow = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  body_md: string;
  source_url: string | null;
  venture_id: string | null;
  created_at: string;
  updated_at: string;
};

export function toDocument(row: DocumentRow): VgDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind as DocumentKind,
    bodyMd: row.body_md,
    sourceUrl: row.source_url,
    ventureId: row.venture_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DocumentRepo {
  constructor(private readonly db: Db) {}

  list(kind?: DocumentKind): VgDocument[] {
    const rows =
      kind === undefined
        ? (this.db.query("SELECT * FROM vg_document ORDER BY updated_at DESC, id DESC").all() as DocumentRow[])
        : (this.db
            .query("SELECT * FROM vg_document WHERE kind = ? ORDER BY updated_at DESC, id DESC")
            .all(kind) as DocumentRow[]);
    return rows.map(toDocument);
  }

  get(id: string): VgDocument | null {
    const row = this.db.query("SELECT * FROM vg_document WHERE id = ?").get(id) as DocumentRow | null;
    return row === null ? null : toDocument(row);
  }

  getBySlug(slug: string): VgDocument | null {
    const row = this.db.query("SELECT * FROM vg_document WHERE slug = ?").get(slug) as DocumentRow | null;
    return row === null ? null : toDocument(row);
  }

  insert(input: {
    id: string;
    slug: string;
    title: string;
    kind: DocumentKind;
    bodyMd: string;
    sourceUrl: string | null;
    ventureId: string | null;
    at: string;
  }): VgDocument {
    this.db
      .query(
        `INSERT INTO vg_document
          (id, slug, title, kind, body_md, source_url, venture_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.slug,
        input.title,
        input.kind,
        input.bodyMd,
        input.sourceUrl,
        input.ventureId,
        input.at,
        input.at,
      );
    const created = this.get(input.id);
    if (created === null) throw new Error(`文档写入失败：${input.id}`);
    return created;
  }

  update(
    id: string,
    patch: { title?: string; bodyMd?: string; kind?: DocumentKind; sourceUrl?: string | null },
    at: string,
  ): VgDocument | null {
    const sets: string[] = [];
    const params: Array<string | null> = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(patch.title);
    }
    if (patch.bodyMd !== undefined) {
      sets.push("body_md = ?");
      params.push(patch.bodyMd);
    }
    if (patch.kind !== undefined) {
      sets.push("kind = ?");
      params.push(patch.kind);
    }
    if (patch.sourceUrl !== undefined) {
      sets.push("source_url = ?");
      params.push(patch.sourceUrl);
    }
    if (sets.length === 0) return this.get(id);
    sets.push("updated_at = ?");
    params.push(at);
    params.push(id);
    this.db.query(`UPDATE vg_document SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    return this.get(id);
  }

  count(): number {
    const row = this.db.query("SELECT COUNT(*) AS n FROM vg_document").get() as { n: number };
    return row.n;
  }
}