# API keys, roles and environments

`FLAGS_API_KEYS=id:secret[:role[:envs]],…`

| Role | Can | Give to |
|---|---|---|
| `write` | create, edit, archive, delete flags; edit and copy states | deploy tooling |
| `read` | evaluate, snapshots, list, history, stats, metrics | applications, dashboards |
| `readwrite` | both (default) | the admin console |

`envs` scopes a key to environments, joined with `+`:

```env
FLAGS_API_KEYS=console:3f9a…,shop-prod:71cc…:read:prod,shop-staging:b02e…:read:staging,qa-bot:e6d1…:readwrite:dev+staging
```

A scoped key:

- evaluates and reads snapshots only for its environments (`403 FORBIDDEN` elsewhere);
- sees only its environments inside flag objects and `GET /v1/environments`;
- may edit states only in its environments;
- cannot delete flags (deletion affects every environment).

Give each deployed application a read key for exactly its environment. A leaked production key then reveals production rules only, and cannot change anything.

## Rate limit

`RATE_LIMIT_MAX` requests per key per minute (default 1 200); `429 RATE_LIMITED`. Applications that need more should use [snapshots](snapshots.md) (one request per poll, not per user).

## Responses

| Status | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or unknown secret; `WWW-Authenticate: Bearer`. |
| 403 | `FORBIDDEN` | Wrong role, or environment outside the key's scope. |
| 404 | `UNKNOWN_ENV` | Environment not in `FLAGS_ENVIRONMENTS`. |

Keys are compared in constant time against every configured secret.
