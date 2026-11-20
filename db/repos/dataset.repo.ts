// modules/venture-grid/db/repos/dataset.repo.ts
import type { Db } from "../database";
import { normalizeDatasetConfig, type DatasetConfig, type DatasetProvider, type ExoplanetRow } from "../../domain/dataset";
import { parseObject } from "./mappers";

export type DatasetRecord = {
  id: string;
  ventureId: string;
  provider: DatasetProvider;
  label: string;
  config: DatasetConfig;
  rows: ExoplanetRow[] | null;
  fetchedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type DatasetRow = {
  id: string;
  venture_id: string;
  provider: string;
  label: string;
  config_json: string;
  cache_json: string | null;
  fetched_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function parseRows(value: string | null): ExoplanetRow[] | null {
  if (value === null || value === "") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ExoplanetRow[]) : null;
  } catch {
    return null;
  }
}

export function toDataset(row: DatasetRow): DatasetRecord {
  return {
    id: row.id,
    ventureId: row.venture_id,
    provider: row.provider as DatasetProvider,
    label: row.label,
    config: normalizeDatasetConfig(parseObject(row.config_json)),
    rows: parseRows(row.cache_json),
    fetchedAt: row.fetched_at,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DatasetRepo {
  constructor(private readonly db: Db) {}

  listByVenture(ventureId: string): DatasetRecord[] {
    const rows = this.db
      .query("SELECT * FROM vg_dataset WHERE venture_id = ? ORDER BY created_at ASC")
      .all(ventureId) as DatasetRow[];
    return rows.map(toDataset);
  }

  get(id: string): DatasetRecord | null {
    const row = this.db.query("SELECT * FROM vg_dataset WHERE id = ?").get(id) as DatasetRow | null;
    return row === null ? null : toDataset(row);
  }

  findByVentureProvider(ventureId: string, provider: DatasetProvider): DatasetRecord | null {
    const row = this.db
      .query("SELECT * FROM vg_dataset WHERE venture_id = ? AND provider = ?")
      .get(ventureId, provider) as DatasetRow | null;
    return row === null ? null : toDataset(row);
  }

  insert(input: {
    id: string;
    ventureId: string;
    provider: DatasetProvider;
    label: string;
    config: DatasetConfig;
    at: string;
  }): DatasetRecord {
    this.db
      .query(
        `INSERT INTO vg_dataset (id, venture_id, provider, label, config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.ventureId,
        input.provider,
        input.label,
        JSON.stringify(input.config),
        input.at,
        input.at,
      );
    const created = this.get(input.id);
    if (created === null) throw new Error(`数据源写入失败：${input.id}`);
    return created;
  }

  saveResult(id: string, rows: ExoplanetRow[], fetchedAt: string, at: string): DatasetRecord | null {
    this.db
      .query(
        "UPDATE vg_dataset SET cache_json = ?, fetched_at = ?, error = NULL, updated_at = ? WHERE id = ?",
      )
      .run(JSON.stringify(rows), fetchedAt, at, id);
    return this.get(id);
  }

  saveError(id: string, error: string, at: string): DatasetRecord | null {
    this.db
      .query("UPDATE vg_dataset SET error = ?, updated_at = ? WHERE id = ?")
      .run(error, at, id);
    return this.get(id);
  }

  updateConfig(
    id: string,
    input: { label?: string; config: DatasetConfig },
    at: string,
  ): DatasetRecord | null {
    this.db
      .query("UPDATE vg_dataset SET label = COALESCE(?, label), config_json = ?, updated_at = ? WHERE id = ?")
      .run(input.label ?? null, JSON.stringify(input.config), at, id);
    return this.get(id);
  }
}