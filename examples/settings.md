# Typed settings

Not every flag is a boolean. String, number and JSON flags turn the service into remote configuration with the same environments, rules and history.

```bash
fcurl -X POST $FLAGS/v1/flags -d '{"key":"search.limit","kind":"number","value":50,"offValue":10,"enabled":true,"description":"Results per page"}'
fcurl -X POST $FLAGS/v1/flags -d '{"key":"banner.text","kind":"string","value":"","offValue":"","enabled":true}'
fcurl -X POST $FLAGS/v1/flags -d '{"key":"payments.providers","kind":"json","value":{"primary":"stripe","fallback":"adyen","retries":2},"offValue":{"primary":"stripe","fallback":null,"retries":0},"enabled":true}'
```

Change prod without a deploy:

```bash
fcurl -X PATCH $FLAGS/v1/flags/search.limit/envs/prod -d '{"value":100}'
fcurl -X PATCH $FLAGS/v1/flags/banner.text/envs/prod -d '{"value":"Free shipping until Sunday"}'
```

Different value for a segment:

```bash
fcurl -X PATCH $FLAGS/v1/flags/search.limit/envs/prod -d '{"rules":[{"id":"enterprise","match":{"attrs":{"plan":["enterprise"]}},"value":500}]}'
```

`enabled: false` serves `offValue`, which for settings is the conservative default, so the kill switch stays meaningful.

## What settings are not for

- Secrets (API keys, passwords): they belong in each service's `.env`; this service has no encryption at rest and every read key can see values.
- Per-user data: rules target segments, not thousands of individual overrides.
- Large documents: values are capped by `MAX_VALUE_BYTES` (16 KiB).

## Validation

Values are checked against the kind on every write (`INVALID_VALUE`). JSON flags accept any JSON, including `null`; add stricter checks in the application that reads them.
