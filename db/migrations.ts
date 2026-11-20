// modules/venture-grid/db/migrations.ts
/**
 * VG 数据库迁移：按 `PRAGMA user_version` 顺序执行，幂等。
 * 只做加法（新增表/索引）；任何破坏性变更都要新开一条迁移并显式备份。
 */
import type { Database } from "bun:sqlite";

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "init",
    sql: `
      CREATE TABLE IF NOT EXISTS vg_venture (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        summary      TEXT NOT NULL DEFAULT '',
        hypothesis   TEXT NOT NULL DEFAULT '',
        parent_id    TEXT REFERENCES vg_venture(id) ON DELETE SET NULL,
        status       TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'suspended', 'closed')),
        tags_json    TEXT NOT NULL DEFAULT '[]',
        fork_origin  TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vg_document (
        id          TEXT PRIMARY KEY,
        slug        TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        kind        TEXT NOT NULL DEFAULT 'guide'
                    CHECK (kind IN ('evidence_source', 'guide', 'glossary', 'brief_archive')),
        body_md     TEXT NOT NULL DEFAULT '',
        source_url  TEXT,
        venture_id  TEXT REFERENCES vg_venture(id) ON DELETE SET NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vg_batch (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL UNIQUE,
        start_at      TEXT NOT NULL,
        end_at        TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'closed')),
        brief_status  TEXT NOT NULL DEFAULT 'pending'
                      CHECK (brief_status IN ('pending', 'generating', 'ready', 'failed')),
        brief_content TEXT NOT NULL DEFAULT '',
        brief_error   TEXT,
        admin_note    TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vg_evidence (
        id              TEXT PRIMARY KEY,
        venture_id      TEXT NOT NULL REFERENCES vg_venture(id) ON DELETE CASCADE,
        source_title    TEXT NOT NULL,
        source_url      TEXT,
        abstract        TEXT NOT NULL,
        abstract_source TEXT NOT NULL DEFAULT 'llm'
                        CHECK (abstract_source IN ('llm', 'admin_edited')),
        tags_json       TEXT NOT NULL DEFAULT '[]',
        document_id     TEXT REFERENCES vg_document(id) ON DELETE SET NULL,
        added_at        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vg_link (
        id              TEXT PRIMARY KEY,
        from_venture_id TEXT NOT NULL REFERENCES vg_venture(id) ON DELETE CASCADE,
        to_venture_id   TEXT NOT NULL REFERENCES vg_venture(id) ON DELETE CASCADE,
        relation_type   TEXT NOT NULL
                        CHECK (relation_type IN ('support', 'contradict', 'depend', 'parallel')),
        note            TEXT,
        created_at      TEXT NOT NULL,
        UNIQUE (from_venture_id, to_venture_id, relation_type)
      );

      CREATE TABLE IF NOT EXISTS vg_score (
        id                 TEXT PRIMARY KEY,
        venture_id         TEXT NOT NULL REFERENCES vg_venture(id) ON DELETE CASCADE,
        batch_id           TEXT NOT NULL REFERENCES vg_batch(id) ON DELETE RESTRICT,
        score              REAL NOT NULL CHECK (score >= 0 AND score <= 100),
        comment            TEXT NOT NULL,
        trend              TEXT NOT NULL DEFAULT 'flat'
                           CHECK (trend IN ('up', 'flat', 'down')),
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        created_at         TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vg_event (
        id           TEXT PRIMARY KEY,
        kind         TEXT NOT NULL
                     CHECK (kind IN ('venture_added', 'score_changed', 'evidence_added',
                                     'link_added', 'status_changed', 'venture_forked',
                                     'document_added', 'brief_generated')),
        venture_id   TEXT REFERENCES vg_venture(id) ON DELETE SET NULL,
        batch_id     TEXT REFERENCES vg_batch(id) ON DELETE SET NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        actor        TEXT NOT NULL DEFAULT 'admin',
        at           TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vg_run (
        id          TEXT PRIMARY KEY,
        kind        TEXT NOT NULL,
        batch_id    TEXT REFERENCES vg_batch(id) ON DELETE SET NULL,
        status      TEXT NOT NULL
                    CHECK (status IN ('running', 'success', 'failed', 'aborted')),
        started_at  TEXT NOT NULL,
        finished_at TEXT,
        error       TEXT,
        stats_json  TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS vg_llm_call (
        id            TEXT PRIMARY KEY,
        provider      TEXT NOT NULL,
        model         TEXT NOT NULL,
        purpose       TEXT NOT NULL,
        status        TEXT NOT NULL CHECK (status IN ('ok', 'error')),
        error_code    TEXT,
        error_message TEXT,
        duration_ms   INTEGER NOT NULL DEFAULT 0,
        prompt_chars  INTEGER NOT NULL DEFAULT 0,
        prompt_sha256 TEXT NOT NULL DEFAULT '',
        at            TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vg_setting (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vg_venture_parent ON vg_venture(parent_id);
      CREATE INDEX IF NOT EXISTS idx_vg_venture_status ON vg_venture(status);
      CREATE INDEX IF NOT EXISTS idx_vg_evidence_venture ON vg_evidence(venture_id);
      CREATE INDEX IF NOT EXISTS idx_vg_link_from ON vg_link(from_venture_id);
      CREATE INDEX IF NOT EXISTS idx_vg_link_to ON vg_link(to_venture_id);
      CREATE INDEX IF NOT EXISTS idx_vg_score_venture_batch ON vg_score(venture_id, batch_id);
      CREATE INDEX IF NOT EXISTS idx_vg_score_batch ON vg_score(batch_id);
      CREATE INDEX IF NOT EXISTS idx_vg_event_at ON vg_event(at);
      CREATE INDEX IF NOT EXISTS idx_vg_event_batch ON vg_event(batch_id);
      CREATE INDEX IF NOT EXISTS idx_vg_document_slug ON vg_document(slug);
      CREATE INDEX IF NOT EXISTS idx_vg_document_venture ON vg_document(venture_id);
      CREATE INDEX IF NOT EXISTS idx_vg_llm_call_at ON vg_llm_call(at);
    `,
  },
  {
    version: 2,
    name: "venture-dataset",
    sql: `
      CREATE TABLE IF NOT EXISTS vg_dataset (
        id           TEXT PRIMARY KEY,
        venture_id   TEXT NOT NULL REFERENCES vg_venture(id) ON DELETE CASCADE,
        provider     TEXT NOT NULL,
        label        TEXT NOT NULL,
        config_json  TEXT NOT NULL DEFAULT '{}',
        cache_json   TEXT,
        fetched_at   TEXT,
        error        TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        UNIQUE (venture_id, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_vg_dataset_venture ON vg_dataset(venture_id);
    `,
  },
  {
    version: 3,
    name: "venture-proposals",
    sql: `
      CREATE TABLE IF NOT EXISTS vg_proposal (
        id               TEXT PRIMARY KEY,
        title            TEXT NOT NULL,
        summary          TEXT NOT NULL DEFAULT '',
        hypothesis       TEXT NOT NULL,
        references_text  TEXT NOT NULL DEFAULT '',
        tags_json        TEXT NOT NULL DEFAULT '[]',
        submitter        TEXT,
        status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'accepted', 'rejected')),
        review_note      TEXT,
        venture_id       TEXT REFERENCES vg_venture(id) ON DELETE SET NULL,
        created_at       TEXT NOT NULL,
        reviewed_at      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_vg_proposal_status ON vg_proposal(status, created_at);
    `,
  },
  {
    version: 4,
    name: "proposal-ai-review-email",
    sql: `
      ALTER TABLE vg_proposal ADD COLUMN email TEXT;
      ALTER TABLE vg_proposal ADD COLUMN reviewed_by TEXT;

      CREATE TABLE IF NOT EXISTS vg_email_log (
        id          TEXT PRIMARY KEY,
        proposal_id TEXT REFERENCES vg_proposal(id) ON DELETE SET NULL,
        to_email    TEXT NOT NULL,
        subject     TEXT NOT NULL,
        status      TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
        provider    TEXT NOT NULL,
        error       TEXT,
        at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vg_email_log_at ON vg_email_log(at);
    `,
  },
];

export function currentVersion(db: Database): number {
  const row = db.query("PRAGMA user_version").get() as { user_version?: number } | null;
  return row?.user_version ?? 0;
}

/** 执行所有未应用的迁移；每条迁移单独一个事务。 */
export function migrate(db: Database): number {
  let version = currentVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= version) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      // PRAGMA 不支持参数绑定；version 来自代码常量，非用户输入。
      db.exec(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
    });
    apply();
    version = migration.version;
  }
  return version;
}