# rollback — CLI 0.4.0

Generated from `fmx catalog rollback --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## rollback

Rollback to a previous version

```sh
fmx rollback [version] [options]
```

- `--list`: List available versions
- `--force`: Skip confirmation
- `--json`: Output as JSON
- `--deployment <dep_id>`: Rollback by deployment ID (alternative to semver) — EVO-394 CA-10
- `--extension <id>`: Extension project ID or api name (defaults to manifest name)

