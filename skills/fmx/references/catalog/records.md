# records — CLI 0.6.0

Generated from `fmx catalog records --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## records

Tenant records: CRUD, conditional writes, batches and aggregates

```sh
fmx records
```

## records list

List records with server filters, ordering and fields

```sh
fmx records list <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..1000) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Fields to request from the server
- `--full`: Complete text and fields
- `--filters <json>`: DataEngine filter map as JSON
- `--order-by <json>`: DataEngine order map as JSON
- `--capabilities`: Include server-provided allowed actions

## records get

Read a record and its allowed actions

```sh
fmx records get <object> <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete text

## records create

Create a record from JSON or a file

```sh
fmx records create <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

## records update

Update a record; --expected enables server compare-and-swap

```sh
fmx records update <object> <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--expected <json>`: Expected field values for conditional update

## records delete

Delete the specified record without interactive prompts

```sh
fmx records delete <object> <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## records batch

Batch operations; partial failures return exit 1 and preserve results

```sh
fmx records batch
```

## records batch create

JSON array of records

```sh
fmx records batch create <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--stop-on-error`: Stop the server batch on its first error
- `--continue-on-error`: Request per-item error reporting instead of stopping

## records batch update

JSON array of {id,data}; conditional writes require records update

```sh
fmx records batch update <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--stop-on-error`: Stop the server batch on its first error
- `--continue-on-error`: Request per-item error reporting instead of stopping

## records batch upsert

JSON array of records

```sh
fmx records batch upsert <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--stop-on-error`: Stop the server batch on its first error
- `--continue-on-error`: Request per-item error reporting instead of stopping
- `--match-field <field>`: Match existing records by this field

## records batch remove

JSON array of record IDs

```sh
fmx records batch remove <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--stop-on-error`: Stop the server batch on its first error
- `--continue-on-error`: Request per-item error reporting instead of stopping

## records aggregate

Server aggregate: COUNT, SUM, AVG, MIN, MAX and statistical aggregates

```sh
fmx records aggregate <object> <operation> <field> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--filters <json>`: DataEngine filter map

