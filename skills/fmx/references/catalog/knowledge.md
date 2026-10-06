# knowledge — CLI 0.5.0

Generated from `fmx catalog knowledge --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## knowledge

Inspect existing knowledge and ingest text through the platform retrieval service

```sh
fmx knowledge
```

## knowledge list

Read knowledge identities and index status

```sh
fmx knowledge list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..1000) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Fields to request from the server
- `--full`: Complete text and fields
- `--filters <json>`: DataEngine filter map as JSON
- `--order-by <json>`: DataEngine order map as JSON

## knowledge status

Read the stored index status; does not prove every chunk is indexed

```sh
fmx knowledge status <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## knowledge ingest

Ingest text into an existing knowledge base; consumes quota and writes data

```sh
fmx knowledge ingest <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/retrieval/ingest",
  "effects": [
    "write",
    "consumes-quota"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "text"
    ],
    "additionalProperties": false
  }
}
```

