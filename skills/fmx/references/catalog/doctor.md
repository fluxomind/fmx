# doctor — CLI 0.5.0

Generated from `fmx catalog doctor --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## doctor

Offline context diagnostics; --remote explicitly enables read-only HTTP probes

```sh
fmx doctor [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--remote`: Check platform health with GET; does not verify every permission
- `--object <name>`: With --remote, probe read permission for one object

