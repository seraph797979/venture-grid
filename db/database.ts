// modules/venture-grid/db/database.ts
/**
 * SQLite 连接入口。
 * - 默认落盘 `modules/venture-grid/data/vg.sqlite`（可用 VG_DB_PATH 覆盖）
 * - WAL + foreign_keys + busy_timeout：单管理员场景下足够，且便于 Docker 卷持久化
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { migrate } from "./migrations";

export type Db = Database;

export const MODULE_ROOT = path.resolve(import.meta.dir, "..");
export const DEFAULT_DB_PATH = path.join(MODULE_ROOT, "data", "vg.sqlite");

export type OpenOptions = {
  /** 文件路径；传 ":memory:" 用于测试 */
  dbPath?: string;
  /** 为 true 时不执行迁移（迁移单独调用） */
  skipMigrate?: boolean;
};

export function resolveDbPath(dbPath?: string): string {
  if (dbPath && dbPath.trim() !== "") return dbPath;
  const fromEnv = (process.env.VG_DB_PATH ?? "").trim();
  return fromEnv !== "" ? path.resolve(fromEnv) : DEFAULT_DB_PATH;
}

export function openDatabase(options: OpenOptions = {}): Db {
  const dbPath = resolveDbPath(options.dbPath);
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  if (options.skipMigrate !== true) migrate(db);
  return db;
}

export function tableNames(db: Db): string[] {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'vg\\_%' ESCAPE '\\' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

export function tableCount(db: Db, table: string): number {
  // 表名来自内部白名单，不接受外部输入
  const row = db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number } | null;
  return row?.n ?? 0;
}