# Evaluating in an application

## One call, every flag

```bash
fcurl "$FLAGS/v1/evaluate?env=prod&userId=u_1001&email=ada@example.com&attrs.plan=pro&attrs.country=TR"
```

```json
{ "env": "prod", "version": 9, "flags": { "checkout.new": true, "banner.text": "Summer sale", "search.limit": 50, "theme": { "primary": "#38bdf8" } } }
```

Header `X-Flags-Version: 9`. Archived flags are absent.

`POST /v1/evaluate` takes the same as JSON and adds `keys` (subset) and `details`:

```bash
fcurl -X POST $FLAGS/v1/evaluate -d '{"env":"prod","context":{"userId":"u_1001","attrs":{"plan":"pro"}},"keys":["checkout.new","search.limit"],"details":true}'
```

```json
{ "env": "prod", "version": 9, "flags": { "checkout.new": { "value": true, "reason": "rollout" }, "search.limit": { "value": 50, "reason": "default" } } }
```

## Reasons

| `reason` | Meaning |
|---|---|
| `disabled` | flag off in this environment → `offValue` |
| `rule` | a targeting rule matched (`ruleId` says which) |
| `rollout` | inside a partial percentage |
| `excluded` | outside the percentage, or anonymous during a partial rollout |
| `default` | enabled, no rule, percentage 100 |
| `missing` | unknown or archived key (only when asked for by key) → `null` |

## Context

| Field | Used for |
|---|---|
| `userId` | rules on user ids; rollout bucket |
| `email` | rules on emails; rollout bucket when no `userId` |
| `attrs` | rules on attributes |

Send what you have. An anonymous request (`{}`) still gets every flag: rules cannot match, partial rollouts exclude it.

## In a Fastify service

```js
export class FlagClient {
  /** @param {{ url: string, apiKey: string, env: string, ttlMs?: number }} o */
  constructor({ url, apiKey, env, ttlMs = 30_000 }) {
    Object.assign(this, { url: url.replace(/\/+$/, ''), apiKey, env, ttlMs });
    /** @type {Map<string, { at: number, flags: Record<string, unknown> }>} */
    this.cache = new Map();
  }

  /** @param {{ userId?: string, email?: string, attrs?: Record<string, string> }} context */
  async all(context) {
    const cacheKey = JSON.stringify(context);
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.flags;
    const res = await fetch(`${this.url}/v1/evaluate`, {
      method: 'POST', headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ env: this.env, context }), signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) { if (hit) return hit.flags; throw new Error(`flags responded ${res.status}`); }
    const { flags } = await res.json();
    this.cache.set(cacheKey, { at: Date.now(), flags });
    return flags;
  }

  /** @template T @param {string} key @param {T} fallback @param {Parameters<FlagClient['all']>[0]} context */
  async get(key, fallback, context) {
    try { const v = (await this.all(context))[key]; return v === undefined || v === null ? fallback : /** @type {T} */ (v); } catch { return fallback; }
  }
}
```

```js
const flags = new FlagClient({ url: process.env.FLAGS_URL, apiKey: process.env.FLAGS_API_KEY, env: 'prod' });
if (await flags.get('checkout.new', false, { userId: user.id, attrs: { plan: user.plan } })) return newCheckout();
```

Always pass a fallback: when the service is unreachable the application must keep working with the safe value. The per-context cache above keeps one user's answer stable for 30 s and avoids a call per request; for many distinct users use a [snapshot](snapshots.md) instead.

## When to use the other endpoints

- `GET /v1/flags/:key/envs/:env`: the raw state, for admin tools, not for applications.
- `GET /v1/snapshot/:env`: the whole rule set, for SDK-style local evaluation.
