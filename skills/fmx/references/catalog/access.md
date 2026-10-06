# access — CLI 0.5.0

Generated from `fmx catalog access --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## access

Inspect server-provided record capabilities; never infer write permission from a successful read

```sh
fmx access
```

## access record

Read the capability snapshot for a specific record

```sh
fmx access record <object> <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## access object

Probe object readability and capabilities of one visible record; no mutation

```sh
fmx access object <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

