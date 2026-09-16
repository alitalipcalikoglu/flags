import { createHash } from 'node:crypto';

/** @typedef {import('../types.js').Context} Context */
/** @typedef {import('../types.js').EnvState} EnvState */
/** @typedef {import('../types.js').Rule} Rule */
/** @typedef {import('../types.js').Evaluation} Evaluation */

/**
 * Decides a flag's value for one context. Order: disabled → offValue; first matching rule → its
 * value; rollout bucket below `percentage` → value; otherwise offValue. Buckets are stable per
 * (flag salt, user), so a user stays on the same side while the percentage only grows.
 */
export class Evaluator {
  /**
   * @param {string} salt      Per-flag rollout salt.
   * @param {string} id        Context identity (userId, else email).
   * @returns {number}         0..9999
   */
  static bucket(salt, id) {
    return createHash('sha256').update(salt).update(':').update(id).digest().readUInt32BE(0) % 10_000;
  }

  /**
   * @param {Rule} rule
   * @param {Context} ctx
   */
  static matches(rule, ctx) {
    const m = rule.match;
    if (m.userIds?.length && (!ctx.userId || !m.userIds.includes(ctx.userId))) return false;
    if (m.emails?.length && (!ctx.email || !m.emails.includes(ctx.email.toLowerCase()))) return false;
    if (m.attrs) {
      for (const [k, allowed] of Object.entries(m.attrs)) {
        const v = ctx.attrs?.[k];
        if (v === undefined || !allowed.includes(v)) return false;
      }
    }
    return Boolean(m.userIds?.length || m.emails?.length || (m.attrs && Object.keys(m.attrs).length));
  }

  /**
   * @param {EnvState} state
   * @param {string} salt
   * @param {Context} ctx
   * @returns {Evaluation}
   */
  static evaluate(state, salt, ctx) {
    if (!state.enabled) return { value: state.offValue, reason: 'disabled' };
    for (const rule of state.rules) if (Evaluator.matches(rule, ctx)) return { value: rule.value, reason: 'rule', ruleId: rule.id };
    if (state.percentage >= 100) return { value: state.value, reason: 'default' };
    const id = ctx.userId ?? ctx.email?.toLowerCase();
    if (!id || state.percentage <= 0) return { value: state.offValue, reason: 'excluded' };
    return Evaluator.bucket(salt, id) < state.percentage * 100 ? { value: state.value, reason: 'rollout' } : { value: state.offValue, reason: 'excluded' };
  }
}
