// modules/venture-grid/services/dataset-service.ts
/**
 * 公开数据源的挂载、缓存与拉取。
 * - 缓存 TTL 6h；过期或强制刷新才出网
 * - 失败不伪造数据：保留旧缓存并标 stale=true，同时把错误写回 vg_dataset.error
 * - 网络实现可注入，单测不发真实请求
 */
import { fetchExoplanets, type FetchExoplanetsOptions, type FetchLike } from "../datasource/exoplanet";
import type { Db } from "../db/database";
import { DatasetRepo, type DatasetRecord } from "../db/repos/dataset.repo";
import { VentureRepo } from "../db/repos/venture.repo";
import {
  DEFAULT_DATASET_CONFIG,
  normalizeDatasetConfig,
  type DatasetConfig,
  type DatasetProvider,
  type DatasetView,
} from "../domain/dataset";

export const DATASET_TTL_MS = 6 * 60 * 60 * 1000;

export type DatasetServiceOptions = {
  db: Db;
  now: () => string;
  idFactory: (prefix: "vgds") => string;
  fetchImpl?: FetchLike;
};

function toView(record: DatasetRecord, extra?: { error?: string | null; stale?: boolean }): DatasetView {
  return {
    id: record.id,
    ventureId: record.ventureId,
    provider: record.provider,
    label: record.label,
    config: record.config,
    rows: record.rows ?? [],
    fetchedAt: record.fetchedAt,
    error: extra?.error ?? record.error,
    stale: extra?.stale ?? false,
  };
}

export class DatasetService {
  private readonly repo: DatasetRepo;
  private readonly ventures: VentureRepo;

  constructor(private readonly options: DatasetServiceOptions) {
    this.repo = new DatasetRepo(options.db);
    this.ventures = new VentureRepo(options.db);
  }

  listByVenture(ventureId: string): DatasetView[] {
    return this.repo.listByVenture(ventureId).map((record) => toView(record));
  }

  get(ventureId: string, datasetId: string): DatasetRecord | null {
    const record = this.repo.get(datasetId);
    if (record === null || record.ventureId !== ventureId) return null;
    return record;
  }

  /** 挂载（幂等）：同一条 Venture + 同一 provider 只保留一条，重复挂载会更新配置与标签。 */
  attach(
    ventureId: string,
    input: { provider?: DatasetProvider; label: string; config?: unknown },
  ): DatasetView {
    if (this.ventures.get(ventureId) === null) {
      throw new Error(`Venture 不存在：${ventureId}`);
    }
    const provider = input.provider ?? "nasa-exoplanet";
    const config = normalizeDatasetConfig(input.config ?? DEFAULT_DATASET_CONFIG);
    const at = this.options.now();
    const existing = this.repo.findByVentureProvider(ventureId, provider);
    if (existing !== null) {
      const updated = this.repo.updateConfig(existing.id, { label: input.label, config }, at);
      if (updated === null) throw new Error(`数据源更新失败：${existing.id}`);
      return toView(updated);
    }
    const created = this.repo.insert({
      id: this.options.idFactory("vgds"),
      ventureId,
      provider,
      label: input.label,
      config,
      at,
    });
    return toView(created);
  }

  /**
   * 读取数据：缓存未过期直接用；否则出网拉取。
   * 失败时保留旧数据并标 stale；无旧数据时 rows=[] + error。
   */
  async listForDisplay(
    ventureId: string,
    options: { force?: boolean; fetchImpl?: FetchLike } = {},
  ): Promise<DatasetView[]> {
    const records = this.repo.listByVenture(ventureId);
    const views: DatasetView[] = [];
    for (const record of records) {
      views.push(await this.resolve(record, options));
    }
    return views;
  }

  async refresh(
    ventureId: string,
    datasetId: string,
    options: { fetchImpl?: FetchLike } = {},
  ): Promise<DatasetView> {
    const record = this.get(ventureId, datasetId);
    if (record === null) throw new Error(`数据源不属于该 Venture：${datasetId}`);
    return this.resolve(record, { force: true, ...options });
  }

  private isFresh(record: DatasetRecord): boolean {
    if (record.fetchedAt === null || record.rows === null) return false;
    const fetched = Date.parse(record.fetchedAt);
    if (Number.isNaN(fetched)) return false;
    return Date.now() - fetched < DATASET_TTL_MS;
  }

  private async resolve(
    record: DatasetRecord,
    options: { force?: boolean; fetchImpl?: FetchLike } = {},
  ): Promise<DatasetView> {
    if (options.force !== true && this.isFresh(record)) {
      return toView(record);
    }
    const at = this.options.now();
    try {
      const selectedFetch = options.fetchImpl ?? this.options.fetchImpl;
      const requestOptions: FetchExoplanetsOptions =
        selectedFetch === undefined ? {} : { fetchImpl: selectedFetch };
      const result = await fetchExoplanets(record.config, requestOptions);
      const saved = this.repo.saveResult(record.id, result.rows, result.fetchedAt, at);
      return toView(saved ?? { ...record, rows: result.rows, fetchedAt: result.fetchedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const saved = this.repo.saveError(record.id, message, at);
      const hasCache = (record.rows ?? []).length > 0;
      return toView(saved ?? record, { error: message, stale: hasCache });
    }
  }
}