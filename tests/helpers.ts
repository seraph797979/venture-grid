// modules/venture-grid/tests/helpers.ts
import { openDatabase, type Db } from "../db/database";
import { VgService } from "../services/vg-service";
import type { FetchLike } from "../datasource/exoplanet";
import type { IdPrefix } from "../domain/ids";

export type TestContext = {
  db: Db;
  service: VgService;
  /** 推进测试时钟 */
  tick: (ms?: number) => string;
  close: () => void;
};

/** 内存 SQLite + 确定性 id + 可推进时钟，保证测试可复现。 */
export function createTestService(options: { fetchImpl?: FetchLike } = {}): TestContext {
  const db = openDatabase({ dbPath: ":memory:" });
  let counter = 0;
  let clock = Date.parse("2026-11-17T09:00:00.000Z"); // 2026-W47 周一
  const tick = (ms = 1000): string => {
    clock += ms;
    return new Date(clock).toISOString();
  };
  // 每次取时间都前进 1s：保证 created_at 严格递增，仓储排序可复现
  const now = (): string => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const service = new VgService({
    db,
    idFactory: (prefix: IdPrefix) => `${prefix}_t${++counter}`,
    now,
    instanceName: "test-instance",
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
  return { db, service, tick, close: () => db.close() };
}

/** 建两条 Venture、两个批次、三态趋势齐全的最小数据集。 */
export function seedTwoBatches(service: VgService): {
  rootId: string;
  childId: string;
  previousBatchId: string;
  currentBatchId: string;
} {
  const previous = service.createBatch({
    name: "Week 2026-W46",
    startTime: "2026-11-09T00:00:00.000Z",
    endTime: "2026-11-15T23:59:59.999Z",
  });
  const current = service.createBatch({
    name: "Week 2026-W47",
    startTime: "2026-11-16T00:00:00.000Z",
    endTime: "2026-11-22T23:59:59.999Z",
  });

  const root = service.createVenture({
    title: "能源自给",
    summary: "能源是门槛",
    hypothesis: "能源正平衡可以降低边际成本。",
    tags: ["energy"],
  });
  const child = service.createVenture({
    title: "闭环物质",
    parentId: root.id,
    hypothesis: "回收率决定驻留规模。",
    tags: ["closed-loop"],
  });

  service.addScore(root.id, {
    score: 60,
    comment: "previous",
    batchId: previous.id,
  });
  service.addScore(child.id, {
    score: 50,
    comment: "previous",
    batchId: previous.id,
  });
  service.addScore(root.id, {
    score: 66,
    comment: "current up",
    batchId: current.id,
  });
  service.addScore(child.id, {
    score: 44,
    comment: "current down",
    batchId: current.id,
  });

  return {
    rootId: root.id,
    childId: child.id,
    previousBatchId: previous.id,
    currentBatchId: current.id,
  };
}

export const withEnv = async (
  values: Record<string, string | undefined>,
  run: () => Promise<void> | void,
): Promise<void> => {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};