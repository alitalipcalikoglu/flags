import { FlagError } from './errors.js';

/** @typedef {import('../types.js').FlagKind} FlagKind */
/** @typedef {import('../types.js').Rule} Rule */

/** Checks values and rules against a flag's kind and size limits. */
export class ValueCheck {
  static RULE_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
  static ATTR_KEY = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;
  static MAX_LIST = 1_000;

  /** @param {number} maxBytes */
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
  }

  /**
   * @param {FlagKind} kind
   * @param {unknown} v
   * @param {string} where
   */
  value(kind, v, where) {
    const ok = kind === 'boolean' ? typeof v === 'boolean'
      : kind === 'string' ? typeof v === 'string'
      : kind === 'number' ? typeof v === 'number' && Number.isFinite(v)
      : v !== undefined && (v === null || typeof v !== 'function');
    if (!ok) throw new FlagError('INVALID_VALUE', `${where} must be a ${kind}`, { where, kind });
    const bytes = Buffer.byteLength(JSON.stringify(v));
    if (bytes > this.maxBytes) throw new FlagError('VALUE_TOO_LARGE', `${where} is ${bytes} bytes, limit ${this.maxBytes}`, { where, bytes, max: this.maxBytes });
    return v;
  }

  /**
   * Normalises a rule list: ids unique, emails lower-cased, lists bounded.
   * @param {FlagKind} kind
   * @param {unknown} raw
   * @returns {Rule[]}
   */
  rules(kind, raw) {
    if (!Array.isArray(raw)) throw new FlagError('INVALID_RULE', 'rules must be an array');
    if (raw.length > 100) throw new FlagError('INVALID_RULE', 'at most 100 rules');
    const ids = new Set();
    return raw.map((r, i) => {
      const where = `rules[${i}]`;
      if (typeof r !== 'object' || r === null) throw new FlagError('INVALID_RULE', `${where} must be an object`);
      const o = /** @type {Record<string, unknown>} */ (r);
      if (typeof o.id !== 'string' || !ValueCheck.RULE_ID.test(o.id)) throw new FlagError('INVALID_RULE', `${where}.id must match [a-z0-9][a-z0-9_-]{0,39}`);
      if (ids.has(o.id)) throw new FlagError('INVALID_RULE', `${where}.id "${o.id}" is duplicated`);
      ids.add(o.id);
      if (o.name !== undefined && (typeof o.name !== 'string' || o.name.length > 120)) throw new FlagError('INVALID_RULE', `${where}.name must be a string of at most 120 characters`);
      const m = /** @type {Record<string, unknown>} */ (typeof o.match === 'object' && o.match !== null ? o.match : {});
      /** @type {Rule['match']} */
      const match = {};
      if (m.userIds !== undefined) match.userIds = ValueCheck.#strings(m.userIds, `${where}.match.userIds`);
      if (m.emails !== undefined) match.emails = [...new Set(ValueCheck.#strings(m.emails, `${where}.match.emails`).map((e) => e.toLowerCase()))];
      if (m.attrs !== undefined) {
        if (typeof m.attrs !== 'object' || m.attrs === null || Array.isArray(m.attrs)) throw new FlagError('INVALID_RULE', `${where}.match.attrs must be an object`);
        match.attrs = {};
        for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (m.attrs))) {
          if (!ValueCheck.ATTR_KEY.test(k)) throw new FlagError('INVALID_RULE', `${where}.match.attrs key "${k}" is not a valid attribute name`);
          match.attrs[k] = ValueCheck.#strings(v, `${where}.match.attrs.${k}`);
        }
      }
      if (!match.userIds?.length && !match.emails?.length && !Object.keys(match.attrs ?? {}).length) throw new FlagError('INVALID_RULE', `${where}.match must name at least one of userIds, emails, attrs`);
      return { id: o.id, ...(o.name !== undefined ? { name: o.name } : {}), match, value: this.value(kind, o.value, `${where}.value`) };
    });
  }

  /**
   * @param {unknown} v
   * @param {string} where
   */
  static #strings(v, where) {
    if (!Array.isArray(v) || v.length > ValueCheck.MAX_LIST || v.some((x) => typeof x !== 'string' || x.length === 0 || x.length > 254)) {
      throw new FlagError('INVALID_RULE', `${where} must be an array of up to ${ValueCheck.MAX_LIST} non-empty strings`);
    }
    return [...new Set(/** @type {string[]} */ (v))];
  }
}
