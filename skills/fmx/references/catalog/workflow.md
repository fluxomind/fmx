# workflow — CLI 0.6.0

Generated from `fmx catalog workflow --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## workflow

Workflow definitions, action schemas, publishing and execution

```sh
fmx workflow
```

## workflow list

List workflow definitions; filters and pagination run on the server

```sh
fmx workflow list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..1000) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Fields to request from the server
- `--full`: Complete text and fields
- `--filters <json>`: DataEngine filter map as JSON
- `--order-by <json>`: DataEngine order map as JSON

## workflow get

Read a workflow definition

```sh
fmx workflow get <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete definition text

## workflow create

Create a draft; payload requires name and type

```sh
fmx workflow create [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Print the entire saved definition

## workflow update

Save changes to a draft workflow definition

```sh
fmx workflow update <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

## workflow delete

Delete the workflow definition

```sh
fmx workflow delete <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## workflow publish

Publish and freeze an immutable definition version

```sh
fmx workflow publish <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## workflow rollback

Restore an immutable version as a new version

```sh
fmx workflow rollback <id> <versionId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## workflow run

Start a workflow; optionally wait until terminal or waiting

```sh
fmx workflow run <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--trigger <json>`: Trigger payload as JSON object
- `--wait`: Wait for terminal status or a suspended run
- `--full`: Do not truncate run text
- `--timeout <ms>`: Wait timeout; does not cancel the run Default: `60000`.
- `--interval <ms>`: Polling interval Default: `1000`.

## workflow versions

Read immutable version history

```sh
fmx workflow versions <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete text

## workflow lifecycle

Read lifecycle and recent instances

```sh
fmx workflow lifecycle <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete text

## workflow runs

List workflow runs, or use runs get <runId>

```sh
fmx workflow runs [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..1000) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Fields to request from the server
- `--full`: Complete text and fields
- `--filters <json>`: DataEngine filter map as JSON
- `--order-by <json>`: DataEngine order map as JSON

## workflow runs get

Read the current status, variables and resolution of a run

```sh
fmx workflow runs get <runId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete text

## workflow events

Read the server-redacted run timeline

```sh
fmx workflow events <runId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete event text

## workflow cancel

Cancel a workflow run

```sh
fmx workflow cancel <runId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--reason <reason>`: Reason for cancellation

## workflow templates

List available workflow templates

```sh
fmx workflow templates [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## workflow clone

Clone a template into a new draft

```sh
fmx workflow clone <templateId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## workflow actions

Discover executable workflow actions and their input schemas

```sh
fmx workflow actions
```

## workflow actions list

Read the action catalog

```sh
fmx workflow actions list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Include all action metadata

## workflow actions schema

Read an action input/output schema

```sh
fmx workflow actions schema <name> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## workflow validate

Validate local structure offline; --remote also reads action input contracts

```sh
fmx workflow validate [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--remote`: Read action schemas from the selected tenant; never executes or writes

## workflow export

Export the canonical definition as a reusable create payload

```sh
fmx workflow export <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--out <path>`: Lossless JSON; refuses to overwrite a file Required.

## workflow diff

Compare local and remote definitions; read-only, ignores definition id/version

```sh
fmx workflow diff <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--file <path>`: Local canonical definition or create payload Required.

## workflow schema

Print the offline canonical definition JSON Schema; no HTTP calls

```sh
fmx workflow schema
```

## workflow approvals

Operate workflow approval tasks through the governed approval service

```sh
fmx workflow approvals
```

## workflow approvals list

Read pending workflow approval tasks

```sh
fmx workflow approvals list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Maximum tasks Default: `20`.
- `--full`: Complete task text

## workflow approvals approve

approve an approval task; policy and ownership checked by the server

```sh
fmx workflow approvals approve <taskId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/workflow/approvals",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "minLength": 1
      }
    },
    "additionalProperties": false
  }
}
```

## workflow approvals reject

reject an approval task; policy and ownership checked by the server

```sh
fmx workflow approvals reject <taskId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/workflow/approvals",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "minLength": 1
      }
    },
    "additionalProperties": false
  }
}
```

## workflow approvals recall

recall an approval task; policy and ownership checked by the server

```sh
fmx workflow approvals recall <taskId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/workflow/approvals",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "minLength": 1
      }
    },
    "additionalProperties": false
  }
}
```

## workflow approvals delegate

delegate an approval task; policy and ownership checked by the server

```sh
fmx workflow approvals delegate <taskId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/workflow/approvals",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "minLength": 1
      },
      "toUserId": {
        "type": "string",
        "minLength": 1
      },
      "notificationRecipientDestination": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "toUserId"
    ],
    "additionalProperties": false
  }
}
```

## workflow pending

Read your personal policy decision queue; separate from workflow approval tasks

```sh
fmx workflow pending [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text
- `--limit <count>`: Rows from the returned source window Default: `20`.
- `--offset <count>`: Offset within the returned source window Default: `0`.
- `--fields <csv>`: Output fields

## workflow run-actions

Read available workflow actions; backend remains authoritative

```sh
fmx workflow run-actions <runId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

