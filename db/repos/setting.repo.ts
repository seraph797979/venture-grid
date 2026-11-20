// modules/venture-grid/db/repos/setting.repo.ts
import type { Db } from "../database";

type SettingRow = { key: string; value_json: string; updated_at: string };

export class SettingRepo {
  constructor(private readonly db: Db) {}

  get(key: string): unknown | null {
    const row = this.db.query("SELECT * FROM vg_setting WHERE key = ?").get(key) as SettingRow | null;
    if (row === null) return null;
    try {
      return JSON.parse(row.value_json) as unknown;
    } catch {
      return null;
    }
  }

  getString(key: string): string | null {
    const value = this.get(key);
    return typeof value === "string" ? value : null;
  }

  set(key: string, value: unknown, at: string): void {
    this.db
      .query(
        `INSERT INTO vg_setting (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value ?? null), at);
  }

  list(): Array<{ key: string; value: unknown }> {
    const rows = this.db.query("SELECT * FROM vg_setting ORDER BY key ASC").all() as SettingRow[];
    return rows.map((row) => {
      try {
        return { key: row.key, value: JSON.parse(row.value_json) as unknown };
      } catch {
        return { key: row.key, value: null };
      }
    });
  }
}