import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Evaluator } from '../src/domain/evaluator.js';

/**
 * 500 frozen (salt, id, percentage) -> (bucket, decision) pairs, generated once from this same
 * Evaluator (see the note in examples/snapshots.md) and pinned here as the compatibility contract
 * for the percentage-bucketing algorithm. Every entry tests Evaluator.bucket() in isolation plus
 * the `bucket < percentage * 100` comparison -- NOT Evaluator.evaluate()'s full decision (which
 * also short-circuits on disabled/rules/percentage>=100/empty id before ever reaching a bucket).
 * @type {{ salt: string, id: string, percentage: number, expectedBucket: number, expectedDecision: string, note?: string }[]}
 */
const vectors = JSON.parse(readFileSync(new URL('../examples/golden-vectors.json', import.meta.url), 'utf8'));

test('golden vectors: exactly 500, frozen bucket-level pairs', () => {
  assert.equal(vectors.length, 500);
});

test('golden vectors: Evaluator.bucket() reproduces every recorded bucket', () => {
  for (const v of vectors) assert.equal(Evaluator.bucket(v.salt, v.id), v.expectedBucket, `bucket mismatch for salt=${v.salt} id=${JSON.stringify(v.id)}`);
});

test('golden vectors: recorded decision matches bucket < percentage * 100', () => {
  for (const v of vectors) {
    const decision = Evaluator.bucket(v.salt, v.id) < v.percentage * 100 ? 'rollout' : 'excluded';
    assert.equal(decision, v.expectedDecision, `decision mismatch for salt=${v.salt} id=${JSON.stringify(v.id)} percentage=${v.percentage}`);
  }
});

test('golden vectors: same id under two different salts buckets differently', () => {
  const pair = vectors.filter((v) => v.id === 'stable-user-77');
  assert.equal(pair.length, 2);
  assert.notEqual(pair[0].expectedBucket, pair[1].expectedBucket);
});

test('golden vectors: threshold pair is genuinely one bucket apart', () => {
  const under = vectors.find((v) => v.note?.includes('threshold pair (1/2)'));
  const over = vectors.find((v) => v.note?.includes('threshold pair (2/2)'));
  assert.ok(under && over, 'threshold pair vectors must be present');
  assert.equal(over.expectedBucket - under.expectedBucket, 1);
  assert.equal(under.expectedDecision, 'rollout');
  assert.equal(over.expectedDecision, 'excluded');
});

// Named regression, deliberately NOT a golden-vectors.json entry: Evaluator.evaluate() short-circuits
// percentage >= 100 to {reason: 'default'} WITHOUT ever calling bucket() -- a different claim than
// "bucket() < percentage*100 is always true at 100", which the bucket-level vectors above already cover.
test('golden vectors (named regression): Evaluator.evaluate() short-circuits percentage>=100 before bucketing', () => {
  /** @type {import('../src/types.js').EnvState} */
  const state = { enabled: true, value: 'on', offValue: 'off', percentage: 100, rules: [] };
  assert.deepEqual(Evaluator.evaluate(state, 'any-salt', { userId: 'anyone' }), { value: 'on', reason: 'default' });
});

// Named regression, deliberately NOT a golden-vectors.json entry: Evaluator.evaluate() short-circuits
// a falsy/empty id to {reason: 'excluded'} BEFORE calling bucket() -- unlike bucket() itself, which
// happily hashes an empty string (see the empty-id vector in golden-vectors.json).
test('golden vectors (named regression): Evaluator.evaluate() short-circuits empty id before bucketing', () => {
  /** @type {import('../src/types.js').EnvState} */
  const state = { enabled: true, value: 'on', offValue: 'off', percentage: 50, rules: [] };
  assert.deepEqual(Evaluator.evaluate(state, 'any-salt', {}), { value: 'off', reason: 'excluded' });
  assert.deepEqual(Evaluator.evaluate(state, 'any-salt', { userId: '' }), { value: 'off', reason: 'excluded' });
});

test('golden vectors: examples/evaluator.js re-exports the same class (no drift)', async () => {
  const { Evaluator: ExamplesEvaluator } = await import('../examples/evaluator.js');
  assert.equal(ExamplesEvaluator, Evaluator);
});
