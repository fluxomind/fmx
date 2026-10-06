# files — CLI 0.5.0

Generated from `fmx catalog files --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## files

Upload, inspect and link files through FileEngine; no local credential handling

```sh
fmx files
```

## files get

Read file identity, shares and links

```sh
fmx files get <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## files for-target

List files attached to a visible target record

```sh
fmx files for-target <object> <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## files link

Link a file to a record; knowledge_source is validated by the platform

```sh
fmx files link [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/fileEngine/linkFile",
  "effects": [
    "write",
    "may-trigger-ingestion"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "file_id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "target_object_api_name": {
        "type": "string",
        "minLength": 1
      },
      "target_record_id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "relation_type": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "file_id",
      "target_object_api_name",
      "target_record_id"
    ],
    "additionalProperties": false
  }
}
```

## files unlink

Remove a file link; does not delete the file

```sh
fmx files unlink [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/fileEngine/unlinkFile",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "file_id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "target_object_api_name": {
        "type": "string",
        "minLength": 1
      },
      "target_record_id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      }
    },
    "required": [
      "file_id",
      "target_object_api_name",
      "target_record_id"
    ],
    "additionalProperties": false
  }
}
```

## files delete

Delete an unreferenced file; server rejects dependent links

```sh
fmx files delete <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "DELETE",
  "endpoint": "/api/services/fileEngine/items",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## files upload

Upload one local file via multipart; maximum 100 MiB

```sh
fmx files upload <path> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--mime <type>`: Explicit MIME type accepted by the platform Required.
- `--folder <id>`: Destination folder

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/fileEngine/upload",
  "effects": [
    "write",
    "uploads-file"
  ],
  "serverAuthoritative": true,
  "validation": "Local size check; server validates MIME, folder and permissions."
}
```

