# resources — CLI 0.5.0

Generated from `fmx catalog resources --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## resources

Declarative DataEngine record fields: validate, plan and conditionally apply; no automatic deletes

```sh
fmx resources
```

## resources schema

Offline manifest schema; semantic identity checks are also required

```sh
fmx resources schema
```

## resources validate

Validate manifest and target shape offline; no authentication or HTTP

```sh
fmx resources validate [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

## resources plan

Offline validation by default; --remote reads schema and current records to calculate changes

```sh
fmx resources plan [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--remote`: Calculate a plan using GET only
- `--out <path>`: Save a complete remote plan; refuses overwrite
- `--full`: Include payloads and baselines in output

## resources apply

Apply a reviewed remote plan sequentially with conditional updates; --dry-run sends no HTTP

```sh
fmx resources apply [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

