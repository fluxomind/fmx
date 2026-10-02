# agent — CLI 0.4.0

Generated from `fmx catalog agent --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## agent

Platform agents: CRUD, portable configuration and execution

```sh
fmx agent
```

## agent list

List tenant agents

```sh
fmx agent list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..1000) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Fields to request from the server
- `--full`: Complete text and fields
- `--filters <json>`: DataEngine filter map as JSON
- `--order-by <json>`: DataEngine order map as JSON

## agent get

Read an agent configuration

```sh
fmx agent get <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete prompt and text

## agent create

Create an agent; payload requires name

```sh
fmx agent create [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

## agent update

Update an agent; optionally enforce a baseline

```sh
fmx agent update <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--expected <json>`: Expected field values

## agent delete

Delete an agent

```sh
fmx agent delete <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## agent export

Export platform portable configuration; --out writes lossless JSON

```sh
fmx agent export <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--out <path>`: Create a JSON file; refuses to overwrite an existing file

## agent import

Import portable configuration using create, update or merge

```sh
fmx agent import [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--mode <mode>`: Import mode: create, update, merge Required.
- `--name <name>`: Override imported agent name
- `--skip-existing-knowledge`: Skip knowledge already linked to the agent

## agent invoke

Execute an agent synchronously; JSON requires messages

```sh
fmx agent invoke <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

## agent models

Discover model slots and configure assignments through the agent API

```sh
fmx agent models
```

## agent models list

Read current assignments and available models; --full includes compatibility metadata

```sh
fmx agent models list <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Include available-model and slot metadata

## agent models assign

Assign a model; payload requires assignment.modelCatalogId and role or slotKey

```sh
fmx agent models assign <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

## agent knowledge

Discover and link knowledge bases through the agent API

```sh
fmx agent knowledge
```

## agent knowledge list

Read linked knowledge bases

```sh
fmx agent knowledge list <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## agent knowledge link

Associate existing knowledge bases; payload requires knowledgeIds array

```sh
fmx agent knowledge link <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

## agent knowledge available

List knowledge not yet linked; source is capped at 500

```sh
fmx agent knowledge available <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text
- `--limit <count>`: Rows from the returned source window Default: `20`.
- `--offset <count>`: Offset within the returned source window Default: `0`.
- `--fields <csv>`: Output fields

## agent knowledge unlink

Remove a knowledge binding; preserves documents

```sh
fmx agent knowledge unlink <id> <junctionId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "DELETE",
  "endpoint": "/api/agent-studio/agents/:id/knowledge/:junctionId",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## agent workers

Manage delegated worker bindings; binding IDs differ from worker agent IDs

```sh
fmx agent workers
```

## agent workers list

List worker bindings for an agent

```sh
fmx agent workers list <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text
- `--limit <count>`: Rows from the returned source window Default: `20`.
- `--offset <count>`: Offset within the returned source window Default: `0`.
- `--fields <csv>`: Output fields

## agent workers available

List worker candidates; backend may return an empty list after a read failure

```sh
fmx agent workers available <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text
- `--limit <count>`: Rows from the returned source window Default: `20`.
- `--offset <count>`: Offset within the returned source window Default: `0`.
- `--fields <csv>`: Output fields

## agent workers link

Bind an existing worker agent

```sh
fmx agent workers link <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/agent-studio/agents/:id/workers",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "workerId": {
        "type": "string",
        "minLength": 1
      },
      "displayOrder": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "isActive": {
        "type": "boolean"
      }
    },
    "required": [
      "workerId"
    ],
    "additionalProperties": false
  }
}
```

## agent workers update

Configure a worker binding; ownership enforced by the platform

```sh
fmx agent workers update <id> <bindingId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "PUT",
  "endpoint": "/api/agent-studio/agents/:id/workers/:bindingId",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "alias": {
        "type": "string",
        "minLength": 1
      },
      "toolPrefixes": {
        "anyOf": [
          {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          {
            "type": "null"
          }
        ]
      },
      "displayOrder": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "isActive": {
        "type": "boolean"
      }
    },
    "additionalProperties": false
  }
}
```

## agent workers unlink

Remove a worker binding; preserves the worker agent

```sh
fmx agent workers unlink <id> <bindingId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "DELETE",
  "endpoint": "/api/agent-studio/agents/:id/workers/:bindingId",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## agent tools

Discover the tenant tool catalog; listing does not prove execute permission

```sh
fmx agent tools
```

## agent tools list

List tenant tool identities; capped at 200

```sh
fmx agent tools list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text
- `--limit <count>`: Rows from the returned source window Default: `20`.
- `--offset <count>`: Offset within the returned source window Default: `0`.
- `--fields <csv>`: Output fields

## agent tools get

Read the agent tool allowlist

```sh
fmx agent tools get <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## agent tools set

Replace the agent tool allowlist; model compatibility is validated by the platform

```sh
fmx agent tools set <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "PUT",
  "endpoint": "/api/agent-studio/agents/:id",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "tools": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "required": [
      "tools"
    ],
    "additionalProperties": false
  }
}
```

