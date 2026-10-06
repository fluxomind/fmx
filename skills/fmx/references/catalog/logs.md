# logs — CLI 0.5.0

Generated from `fmx catalog logs --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## logs

View extension logs

```sh
fmx logs [extensionId] [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--tail`: Stream logs in real-time
- `--level <level>`: Filter by level: error, warn, info, debug
- `--since <time>`: Show logs since (e.g., 1h, 30m, 2024-01-01)
- `--limit <n>`: Maximum number of log entries Default: `"100"`.
- `--json`: Output as NDJSON
- `--extension <id>`: Filter by extension ID (alternative to positional arg) — EVO-394
- `--grep <pattern>`: Regex match in log message field — EVO-394
- `--trace <cid>`: Filter by correlation ID (OTel) — EVO-394

