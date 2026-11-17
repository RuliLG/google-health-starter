// Local SQLite database (Node's built-in node:sqlite, no native modules to compile).
// Lives in the app's userData folder, outside the repo, so health data is never committed.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type DB = DatabaseSync;

// Each entry upgrades the schema by one version. Append new migrations, never edit old ones.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

  -- Every data point from the API, one row each. payload = the full JSON from Google.
  CREATE TABLE data_points (
    type        TEXT NOT NULL,     -- API data type, e.g. 'steps', 'sleep', or 'heart-rate-5min' for our HR rollup
    id          TEXT NOT NULL,     -- API id for sessions, otherwise derived from time + source
    start_utc   TEXT,              -- ISO 8601 UTC
    end_utc     TEXT,
    local_date  TEXT,              -- YYYY-MM-DD in the person's local time (sleep: the wake-up day)
    local_start TEXT,              -- YYYY-MM-DDTHH:MM:SS local wall-clock time
    value       REAL,              -- main number (see src/main/sync/catalog.ts)
    payload     TEXT NOT NULL,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (type, id)
  );
  CREATE INDEX idx_points_type_date  ON data_points(type, local_date);
  CREATE INDEX idx_points_type_start ON data_points(type, start_utc);

  -- One number per local day and metric. The easiest table to build features on.
  CREATE TABLE daily_metrics (
    date      TEXT NOT NULL,
    metric    TEXT NOT NULL,
    value     REAL,
    payload   TEXT,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (date, metric)
  );

  CREATE TABLE devices (id TEXT PRIMARY KEY, payload TEXT NOT NULL, synced_at TEXT NOT NULL);

  CREATE TABLE sync_state (
    stream          TEXT PRIMARY KEY,
    last_success_at TEXT,
    synced_from     TEXT,          -- oldest local date we have fully synced
    last_attempt_at TEXT,
    last_error      TEXT,
    last_error_code TEXT,
    rows_last_run   INTEGER DEFAULT 0
  );

  CREATE TABLE sync_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    trigger     TEXT,
    status      TEXT,
    error       TEXT,
    rows        INTEGER DEFAULT 0
  );
  `,
];

export function openDb(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function openReadOnly(file: string): DB {
  return new DatabaseSync(file, { readOnly: true });
}

function migrate(db: DB) {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

export function getMeta(db: DB, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DB, key: string, value: string) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** Runs fn inside a transaction (fast bulk upserts). */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
