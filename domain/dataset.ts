// modules/venture-grid/domain/dataset.ts
/**
 * 公开数据源：配置、行结构、ADQL 查询构造。
 * 目前只接 NASA Exoplanet Archive（TAP/ADQL，公开无需密钥）。
 */

export type DatasetProvider = "nasa-exoplanet";

export type DatasetConfig = {
  /** 行星半径上限（地球半径 R⊕） */
  maxRadius: number;
  /** 平衡温度下限（K） */
  tempMin: number;
  /** 平衡温度上限（K） */
  tempMax: number;
  /** 返回条数上限 */
  limit: number;
};

export const DEFAULT_DATASET_CONFIG: DatasetConfig = {
  maxRadius: 2,
  tempMin: 200,
  tempMax: 320,
  limit: 40,
};

export type ExoplanetRow = {
  name: string;
  host: string;
  discYear: number | null;
  orbitalPeriod: number | null;
  radius: number | null;
  eqTemp: number | null;
  starTeff: number | null;
  starRadius: number | null;
  starMass: number | null;
  distancePc: number | null;
};

export type DatasetView = {
  id: string;
  ventureId: string;
  provider: DatasetProvider;
  label: string;
  config: DatasetConfig;
  rows: ExoplanetRow[];
  fetchedAt: string | null;
  error: string | null;
  /** true = 本次拉取失败，展示的是缓存 */
  stale: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeDatasetConfig(input: unknown): DatasetConfig {
  const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const maxRadius = clamp(numberOr(record.maxRadius, DEFAULT_DATASET_CONFIG.maxRadius), 0.1, 20);
  const tempMinRaw = numberOr(record.tempMin, DEFAULT_DATASET_CONFIG.tempMin);
  const tempMaxRaw = numberOr(record.tempMax, DEFAULT_DATASET_CONFIG.tempMax);
  const tempMin = clamp(Math.min(tempMinRaw, tempMaxRaw), 20, 3000);
  const tempMax = clamp(Math.max(tempMinRaw, tempMaxRaw), tempMin, 3000);
  const limit = Math.round(clamp(numberOr(record.limit, DEFAULT_DATASET_CONFIG.limit), 1, 200));
  return { maxRadius, tempMin, tempMax, limit };
}

/** 只用校验过的数字拼 ADQL，避免注入。 */
export function buildExoplanetQuery(config: DatasetConfig): string {
  const safe = normalizeDatasetConfig(config);
  return [
    `select top ${safe.limit}`,
    "pl_name,hostname,disc_year,pl_orbper,pl_rade,pl_eqt,st_teff,st_rad,st_mass,sy_dist",
    "from pscomppars",
    "where pl_rade is not null and pl_eqt is not null",
    `and pl_rade <= ${safe.maxRadius}`,
    `and pl_eqt between ${safe.tempMin} and ${safe.tempMax}`,
    "order by sy_dist asc",
  ].join(" ");
}

export function normalizeExoplanetRow(raw: unknown): ExoplanetRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const name = typeof row.pl_name === "string" ? row.pl_name : "";
  if (name === "") return null;
  const numeric = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  return {
    name,
    host: typeof row.hostname === "string" ? row.hostname : "",
    discYear: numeric(row.disc_year),
    orbitalPeriod: numeric(row.pl_orbper),
    radius: numeric(row.pl_rade),
    eqTemp: numeric(row.pl_eqt),
    starTeff: numeric(row.st_teff),
    starRadius: numeric(row.st_rad),
    starMass: numeric(row.st_mass),
    distancePc: numeric(row.sy_dist),
  };
}