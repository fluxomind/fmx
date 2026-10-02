# connections — CLI 0.4.0-alpha.5

Generated from `fmx catalog connections --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## connections

Inspect integration connections without returning credentials

```sh
fmx connections
```

## connections list

List integration identities and health; secret fields are never printed

```sh
fmx connections list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## connections create

Create a connection; use --file or stdin for credentials; secret fields never printed

```sh
fmx connections create [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

