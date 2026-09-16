/** @typedef {import('../db.js').Database} Database */
/** @typedef {import('../types.js').HistoryRow} HistoryRow */

/** Append-only change log per flag. */
export class HistoryStore {
  /** @param {Database} db */
  constructor(db) {
    this.stmt = {
      insert: db.prepare(`INSERT INTO history (key, env, action, actor, before, after, at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      forKey: db.prepare(`SELECT id, key, env, action, actor, before, after, at FROM history WHERE key = ? AND id < ? ORDER BY id DESC LIMIT ?`),
      recent: db.prepare(`SELECT id, key, env, action, actor, before, after, at FROM history WHERE id < ? ORDER BY id DESC LIMIT ?`),
      purge: db.prepare(`DELETE FROM history WHERE at < ?`),
    };
  }

  /**
   * @param {{ key: string, env?: string|null, action: string, actor: string, before?: unknown, after?: unknown }} h
   * @param {number} [now]
   */
  record({ key, env = null, action, actor, before = null, after = null }, now = Date.now()) {
    this.stmt.insert.run(key, env, action, actor, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), now);
  }

  /**
   * @param {string|null} key  Null for every flag.
   * @param {{ limit: number, beforeId?: number }} q
   * @returns {HistoryRow[]}
   */
  list(key, { limit, beforeId = Number.MAX_SAFE_INTEGER }) {
    return /** @type {HistoryRow[]} */ (key === null ? this.stmt.recent.all(beforeId, limit) : this.stmt.forKey.all(key, beforeId, limit));
  }

  /** @param {number} before */
  purge(before) {
    return Number(this.stmt.purge.run(before).changes);
  }
}
