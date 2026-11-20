// modules/venture-grid/tests/dataset.test.ts
import { describe, expect, test } from "bun:test";
import { buildExoplanetQuery, normalizeDatasetConfig, normalizeExoplanetRow } from "../domain/dataset";
import { DataSourceError, fetchExoplanets, type FetchLike } from "../datasource/exoplanet";
import { createTestService } from "./helpers";

const SAMPLE = [
  {
    pl_name: "Kepler-62 f",
    hostname: "Kepler-62",
    disc_year: 2013,
    pl_orbper: 267.2833,
    pl_rade: 1.42,
    pl_eqt: 205,
    st_teff: 4797,
    st_rad: 0.653,
    st_mass: 0.637,
    sy_dist: 300.874,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("公开数据源 · 查询与解析", () => {
  test("配置收敛到安全范围，ADQL 只用数字", () => {
    const config = normalizeDatasetConfig({ maxRadius: 999, tempMin: 500, tempMax: 100, limit: -3 });
    expect(config.maxRadius).toBe(20);
    expect(config.tempMin).toBe(100);
    expect(config.tempMax).toBe(500);
    expect(config.limit).toBe(1);
    const query = buildExoplanetQuery({ maxRadius: 2, tempMin: 200, tempMax: 320, limit: 40 });
    expect(query).toContain("select top 40");
    expect(query).toContain("pl_rade <= 2");
    expect(query).toContain("pl_eqt between 200 and 320");
    expect(query).toContain("from pscomppars");
  });

  test("行归一化：数字/字符串/缺失", () => {
    const row = normalizeExoplanetRow({ ...SAMPLE[0], sy_dist: "12.5", st_teff: null });
    expect(row?.name).toBe("Kepler-62 f");
    expect(row?.distancePc).toBe(12.5);
    expect(row?.starTeff).toBeNull();
    expect(normalizeExoplanetRow({ hostname: "no-name" })).toBeNull();
  });

  test("HTTP 失败与超时都抛 DataSourceError", async () => {
    await expect(
      fetchExoplanets(
        { maxRadius: 2, tempMin: 200, tempMax: 320, limit: 5 },
        { fetchImpl: async () => jsonResponse({ error: "boom" }, 500) },
      ),
    ).rejects.toBeInstanceOf(DataSourceError);

    const timeoutFetch: FetchLike = async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    };
    await expect(
      fetchExoplanets(
        { maxRadius: 2, tempMin: 200, tempMax: 320, limit: 5 },
        { fetchImpl: timeoutFetch },
      ),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("公开数据源 · 缓存与失败语义", () => {
  test("首次拉取、TTL 内复用、强制刷新", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return jsonResponse(SAMPLE);
    };
    const ctx = createTestService({ fetchImpl });
    try {
      const venture = ctx.service.createVenture({ title: "寻找可用行星" });
      ctx.service.datasets.attach(venture.id, { label: "NASA", config: { limit: 5 } });

      const first = await ctx.service.datasets.listForDisplay(venture.id);
      expect(calls).toBe(1);
      expect(first[0]?.rows).toHaveLength(1);
      expect(first[0]?.fetchedAt).not.toBeNull();
      expect(first[0]?.error).toBeNull();

      const second = await ctx.service.datasets.listForDisplay(venture.id);
      expect(calls).toBe(1); // 未过期，不再出网
      expect(second[0]?.rows).toHaveLength(1);

      await ctx.service.datasets.refresh(venture.id, first[0]!.id);
      expect(calls).toBe(2);
    } finally {
      ctx.close();
    }
  });

  test("刷新失败：保留旧缓存并标 stale，同时记录错误", async () => {
    let fail = false;
    const fetchImpl: FetchLike = async () => {
      if (fail) return jsonResponse({ error: "down" }, 503);
      return jsonResponse(SAMPLE);
    };
    const ctx = createTestService({ fetchImpl });
    try {
      const venture = ctx.service.createVenture({ title: "寻找可用行星" });
      const attached = ctx.service.datasets.attach(venture.id, { label: "NASA", config: { limit: 5 } });
      const first = await ctx.service.datasets.listForDisplay(venture.id);
      expect(first[0]?.rows).toHaveLength(1);

      fail = true;
      const refreshed = await ctx.service.datasets.refresh(venture.id, attached.id);
      expect(refreshed.stale).toBe(true);
      expect(refreshed.error).toContain("HTTP 503");
      expect(refreshed.rows).toHaveLength(1); // 旧数据仍在

      const stored = ctx.service.datasets.get(venture.id, attached.id);
      expect(stored?.error).toContain("HTTP 503");
    } finally {
      ctx.close();
    }
  });

  test("无缓存时失败：返回空列表 + 错误，不伪造数据", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ error: "down" }, 500);
    const ctx = createTestService({ fetchImpl });
    try {
      const venture = ctx.service.createVenture({ title: "寻找可用行星" });
      ctx.service.datasets.attach(venture.id, { label: "NASA" });
      const views = await ctx.service.datasets.listForDisplay(venture.id);
      expect(views[0]?.rows).toHaveLength(0);
      expect(views[0]?.stale).toBe(false);
      expect(views[0]?.error).toContain("HTTP 500");
    } finally {
      ctx.close();
    }
  });

  test("重复挂载同一 provider 只保留一条", () => {
    const ctx = createTestService();
    try {
      const venture = ctx.service.createVenture({ title: "寻找可用行星" });
      const first = ctx.service.datasets.attach(venture.id, { label: "v1", config: { limit: 5 } });
      const second = ctx.service.datasets.attach(venture.id, { label: "v2", config: { limit: 9 } });
      expect(second.id).toBe(first.id);
      expect(second.label).toBe("v2");
      expect(second.config.limit).toBe(9);
      expect(ctx.service.datasets.listByVenture(venture.id)).toHaveLength(1);
    } finally {
      ctx.close();
    }
  });
});