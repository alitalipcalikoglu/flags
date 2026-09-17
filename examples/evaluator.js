// Standalone, runnable copy of the production evaluation semantics: percentage bucketing,
// rule matching, and the disabled/rollout/excluded/default reason codes. It re-exports the real
// class instead of reimplementing it, so this file can never silently drift from
// ../src/domain/evaluator.js -- the compatibility contract (golden-vectors.json, tested by
// ../test/golden-vectors.test.js) is pinned against the one real implementation, not a copy of it.
//
// Usage:
//   import { Evaluator } from './evaluator.js';
//   Evaluator.evaluate(envState, flagSalt, { userId: 'u1' });
//
// See snapshots.md for a version of this same algorithm meant to be copied into an external
// application (which has no access to this repo's src/), and golden-vectors.json for 500 frozen
// input/output pairs proving the percentage-bucketing formula.
export { Evaluator } from '../src/domain/evaluator.js';
