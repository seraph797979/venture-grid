// modules/venture-grid/db/repos/proposal.repo.ts
import type { Db } from "../database";
import type { ProposalStatus, VentureProposal } from "../../domain/types";
import { parseStringArray } from "./mappers";

type ProposalRow = {
  id: string;
  title: string;
  summary: string;
  hypothesis: string;
  references_text: string;
  tags_json: string;
  submitter: string | null;
  email: string | null;
  status: string;
  review_note: string | null;
  reviewed_by: string | null;
  venture_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function toProposal(row: ProposalRow): VentureProposal {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    hypothesis: row.hypothesis,
    referencesText: row.references_text,
    tags: parseStringArray(row.tags_json),
    submitter: row.submitter,
    email: row.email,
    status: row.status as ProposalStatus,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    ventureId: row.venture_id,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export class ProposalRepo {
  constructor(private readonly db: Db) {}

  list(status?: ProposalStatus, limit = 100): VentureProposal[] {
    const capped = Math.max(1, Math.min(limit, 500));
    const rows =
      status === undefined
        ? (this.db
            .query(`SELECT * FROM vg_proposal ORDER BY created_at DESC LIMIT ${capped}`)
            .all() as ProposalRow[])
        : (this.db
            .query(
              `SELECT * FROM vg_proposal WHERE status = ? ORDER BY created_at DESC LIMIT ${capped}`,
            )
            .all(status) as ProposalRow[]);
    return rows.map(toProposal);
  }

  get(id: string): VentureProposal | null {
    const row = this.db.query("SELECT * FROM vg_proposal WHERE id = ?").get(id) as ProposalRow | null;
    return row === null ? null : toProposal(row);
  }

  insert(input: {
    id: string;
    title: string;
    summary: string;
    hypothesis: string;
    referencesText: string;
    tags: string[];
    submitter: string | null;
    email: string | null;
    at: string;
  }): VentureProposal {
    this.db
      .query(
        `INSERT INTO vg_proposal
          (id, title, summary, hypothesis, references_text, tags_json, submitter, email, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.title,
        input.summary,
        input.hypothesis,
        input.referencesText,
        JSON.stringify(input.tags),
        input.submitter,
        input.email,
        input.at,
      );
    const created = this.get(input.id);
    if (created === null) throw new Error(`提案写入失败：${input.id}`);
    return created;
  }

  markAccepted(
    id: string,
    ventureId: string,
    note: string | null,
    reviewedBy: string,
    at: string,
  ): VentureProposal | null {
    this.db
      .query(
        "UPDATE vg_proposal SET status = 'accepted', venture_id = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      )
      .run(ventureId, note, reviewedBy, at, id);
    return this.get(id);
  }

  markRejected(id: string, note: string | null, reviewedBy: string, at: string): VentureProposal | null {
    this.db
      .query(
        "UPDATE vg_proposal SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      )
      .run(note, reviewedBy, at, id);
    return this.get(id);
  }

  countPending(): number {
    const row = this.db
      .query("SELECT COUNT(*) AS n FROM vg_proposal WHERE status = 'pending'")
      .get() as { n: number };
    return row.n;
  }
}