// modules/venture-grid/db/repos/email-log.repo.ts
import type { Db } from "../database";

export type EmailLogRecord = {
  id: string;
  proposalId: string | null;
  toEmail: string;
  subject: string;
  status: "sent" | "failed";
  provider: string;
  error: string | null;
  at: string;
};

type EmailLogRow = {
  id: string;
  proposal_id: string | null;
  to_email: string;
  subject: string;
  status: string;
  provider: string;
  error: string | null;
  at: string;
};

function toLog(row: EmailLogRow): EmailLogRecord {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    toEmail: row.to_email,
    subject: row.subject,
    status: row.status as "sent" | "failed",
    provider: row.provider,
    error: row.error,
    at: row.at,
  };
}

export class EmailLogRepo {
  constructor(private readonly db: Db) {}

  record(input: EmailLogRecord): void {
    this.db
      .query(
        `INSERT INTO vg_email_log (id, proposal_id, to_email, subject, status, provider, error, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.proposalId,
        input.toEmail,
        input.subject,
        input.status,
        input.provider,
        input.error,
        input.at,
      );
  }

  list(limit = 50): EmailLogRecord[] {
    const rows = this.db
      .query(`SELECT * FROM vg_email_log ORDER BY at DESC LIMIT ${Math.max(1, Math.min(limit, 500))}`)
      .all() as EmailLogRow[];
    return rows.map(toLog);
  }

  byProposal(proposalId: string): EmailLogRecord[] {
    const rows = this.db
      .query("SELECT * FROM vg_email_log WHERE proposal_id = ? ORDER BY at DESC")
      .all(proposalId) as EmailLogRow[];
    return rows.map(toLog);
  }
}