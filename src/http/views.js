import { FlagService } from '../domain/flag-service.js';

/** @typedef {import('../types.js').FlagRow} FlagRow */
/** @typedef {import('../types.js').EnvRow} EnvRow */
/** @typedef {import('../types.js').HistoryRow} HistoryRow */

/** Response shapes. */
export class Views {
  /** @param {number} t */
  static iso(t) {
    return new Date(Number(t)).toISOString();
  }

  /**
   * @param {FlagRow} f
   * @param {EnvRow[]} [envs]
   */
  static flag(f, envs) {
    return {
      key: f.key, kind: f.kind, description: f.description, tags: /** @type {string[]} */ (JSON.parse(f.tags)), archived: f.archived === 1,
      createdBy: f.created_by, createdAt: Views.iso(f.created_at), updatedAt: Views.iso(f.updated_at),
      ...(envs ? { environments: Object.fromEntries(envs.map((e) => [e.env, Views.env(e)])) } : {}),
    };
  }

  /** @param {EnvRow} e */
  static env(e) {
    return { ...FlagService.state(e), version: Number(e.version), updatedBy: e.updated_by, updatedAt: Views.iso(e.updated_at) };
  }

  /** @param {HistoryRow} h */
  static history(h) {
    return { id: Number(h.id), key: h.key, env: h.env, action: h.action, actor: h.actor, before: h.before === null ? null : JSON.parse(h.before), after: h.after === null ? null : JSON.parse(h.after), at: Views.iso(h.at) };
  }
}
