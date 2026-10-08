# query — CLI 0.6.0

Generated from `fmx catalog query --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## query

Read records (default fields when present: id,name,api_name,status)

```sh
fmx query <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..1000) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Explicit output fields
- `--full`: Include complete text and all fields
- `--filters <json>`: Filter object as JSON; validated before network access

