# Percentage rollouts

```bash
fcurl -X PATCH $FLAGS/v1/flags/checkout.new/envs/prod -d '{"enabled":true,"percentage":10}'
```

Ten percent of identified users get `value`, the rest `offValue`. Raise it over days:

```bash
fcurl -X PATCH $FLAGS/v1/flags/checkout.new/envs/prod -d '{"percentage":50}'
fcurl -X PATCH $FLAGS/v1/flags/checkout.new/envs/prod -d '{"percentage":100}'
```

## How buckets work

Each user lands in a bucket `0..9999` computed as `SHA-256(flagSalt + ":" + id) mod 10000`, where `id` is `userId` (else `email`, lower-cased). A user is inside the rollout when `bucket < percentage × 100`. Consequences:

- The same user always gets the same answer for the same flag and percentage.
- Raising the percentage only adds users; nobody who had the feature loses it.
- Different flags use different salts, so being in one 10% says nothing about another flag's 10%.
- Contexts without `userId` or `email` are always outside a partial rollout (`reason: "excluded"`) and inside at 100%. Give anonymous visitors a stable id (a cookie) if they should take part.

## Reshuffling

To draw a fresh 10% (for example after a bug that affected the first cohort):

```bash
fcurl -X PATCH $FLAGS/v1/flags/checkout.new -d '{"reshuffle":true}'
```

The flag's salt changes; every user gets a new bucket. Applications see it as a version change.

## Rules and rollouts together

Rules are evaluated first, then the percentage. Typical shape: internal staff always on (rule), 5% of everyone else (percentage), then 100%. See [targeting](targeting.md).

## Checking a specific user

```bash
fcurl "$FLAGS/v1/evaluate?env=prod&userId=u_1001&keys=checkout.new&details=true"
```

```json
{ "env": "prod", "version": 9, "flags": { "checkout.new": { "value": false, "reason": "excluded" } } }
```
