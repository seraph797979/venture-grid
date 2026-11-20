// modules/venture-grid/db/repos/llm-call.repo.ts
import type { Db } from "../database";
import type { LlmCallRecord } from "../../domain/types";

type LlmCallRow = {
  id: string;
  provider: string;
  model: string;
  purpose: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number;
  prompt_chars: number;
  prompt_sha256: string;
  at: string;
};

export function toLlmCall(row: LlmCallRow): LlmCallRecord {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    purpose: row.purpose,
    status: row.status as "ok" | "error",
    errorCode: row.error_code,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    promptChars: row.prompt_chars,
    promptSha256: row.prompt_sha256,
    at: row.at,
  };
}

export class LlmCallRepo {
  constructor(private readonly db: Db) {}

  record(input: LlmCallRecord): void {
    this.db
      .query(
        `INSERT INTO vg_llm_call
          (id, provider, model, purpose, status, error_code, error_message, duration_ms, prompt_chars, prompt_sha256, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.provider,
        input.model,
        input.purpose,
        input.status,
        input.errorCode,
        input.errorMessage,
        input.durationMs,
        input.promptChars,
        input.promptSha256,
        input.at,
      );
  }

  list(limit = 50): LlmCallRecord[] {
    const rows = this.db
      .query(`SELECT * FROM vg_llm_call ORDER BY at DESC LIMIT ${Math.max(1, Math.min(limit, 500))}`)
      .all() as LlmCallRow[];
    return rows.map(toLlmCall);
  }

  countErrors(): number {
    const row = this.db
      .query("SELECT COUNT(*) AS n FROM vg_llm_call WHERE status = 'error'")
      .get() as { n: number };
    return row.n;
  }
}