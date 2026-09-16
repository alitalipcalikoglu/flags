# Targeting rules

A rule is `{ id, name?, match, value }`. Rules are tried in order; the first whose `match` fits the context wins and its `value` is served (only while the flag is enabled).

```bash
fcurl -X PATCH $FLAGS/v1/flags/checkout.new/envs/prod -d '{
  "rules": [
    { "id": "staff",   "name": "Internal staff",   "match": { "emails": ["ada@example.com", "grace@example.com"] }, "value": true },
    { "id": "beta",    "name": "Beta plan",        "match": { "attrs": { "plan": ["beta", "enterprise"] } },        "value": true },
    { "id": "blocked", "name": "Known problem",    "match": { "userIds": ["u_666"] },                                "value": false }
  ]
}'
```

## Match conditions

| Field | Matches when |
|---|---|
| `userIds` | context `userId` is in the list |
| `emails` | context `email` (case-insensitive) is in the list |
| `attrs` | for **every** listed attribute, the context's value is in that attribute's list |

Several fields in one `match` are ANDed. Lists hold up to 1 000 entries; a rule must name at least one condition. Rule ids are `[a-z0-9][a-z0-9_-]{0,39}` and unique within the state; they appear in evaluation details (`"reason": "rule", "ruleId": "beta"`) and in history.

## Attributes

Anything your application knows about the caller and passes in `context.attrs`: `plan`, `country`, `appVersion`, `tenant`. Keys match `[a-zA-Z][a-zA-Z0-9_.-]{0,63}`, values are strings. Numeric comparisons are not supported; bucket numbers into strings (`"appVersion": "5.x"`) on the application side.

## Order matters

Put the most specific rules first. A rule that turns something **off** for a user must precede a broader rule that turns it on.

## Replacing vs editing

`PATCH` with `rules` replaces the whole list. Read the current state, edit, write back:

```bash
fcurl $FLAGS/v1/flags/checkout.new/envs/prod | jq '.state.rules'
```

## Testing a rule

```bash
fcurl -X POST $FLAGS/v1/evaluate -d '{"env":"prod","context":{"email":"ada@example.com"},"keys":["checkout.new"],"details":true}'
# { "flags": { "checkout.new": { "value": true, "reason": "rule", "ruleId": "staff" } } }
```
