import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** SQLite connection with schema migrations applied on open. */
export class Database {
  /** @type {readonly string[]} */
  static MIGRATIONS = [
    `
    CREATE TABLE flags (
      key          TEXT PRIMARY KEY,
      kind         TEXT NOT NULL CHECK (kind IN ('boolean', 'string', 'number', 'json')),
      description  TEXT NOT NULL DEFAULT '',
      tags         TEXT NOT NULL DEFAULT '[]',
      archived     INTEGER NOT NULL DEFAULT 0,
      rollout_salt TEXT NOT NULL,
      created_by   TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE flag_envs (
      key         TEXT NOT NULL REFERENCES flags(key) ON DELETE CASCADE,
      env         TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 0,
      value       TEXT NOT NULL,
      off_value   TEXT NOT NULL,
      percentage  INTEGER NOT NULL DEFAULT 100,
      rules       TEXT NOT NULL DEFAULT '[]',
      version     INTEGER NOT NULL DEFAULT 1,
      updated_by  TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (key, env)
    );
    CREATE INDEX flag_envs_env ON flag_envs (env);

    -- One counter per environment, bumped on every change; the snapshot ETag.
    CREATE TABLE env_versions (
      env     TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE history (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      key     TEXT NOT NULL,
      env     TEXT,
      action  TEXT NOT NULL,
      actor   TEXT NOT NULL,
      before  TEXT,
      after   TEXT,
      at      INTEGER NOT NULL
    );
    CREATE INDEX history_key ON history (key, id DESC);
    CREATE INDEX history_at ON history (at);
    `,
  ];

  /** @param {string} path File path, or ":memory:". */
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    /** @readonly */
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA synchronous = NORMAL');
    this.raw.exec('PRAGMA busy_timeout = 5000');
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.#migrate();
  }

  #migrate() {
    const { user_version: current } = /** @type {{ user_version: number }} */ (this.raw.prepare('PRAGMA user_version').get());
    for (let v = current; v < Database.MIGRATIONS.length; v++) {
      this.raw.exec('BEGIN');
      try {
        this.raw.exec(Database.MIGRATIONS[v]);
        this.raw.exec(`PRAGMA user_version = ${v + 1}`);
        this.raw.exec('COMMIT');
      } catch (err) {
        this.raw.exec('ROLLBACK');
        throw err;
      }
    }
  }

  /** @param {string} sql */
  prepare(sql) {
    return this.raw.prepare(sql);
  }

  /**
   * Run `fn` inside a write transaction; rolls back on throw.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  transaction(fn) {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }

  /** Cheap liveness probe; throws if the connection is unusable. */
  ping() {
    this.raw.prepare('SELECT 1').get();
  }

  close() {
    this.raw.close();
  }
}
