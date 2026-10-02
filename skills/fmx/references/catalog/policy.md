# policy — CLI 0.4.0

Generated from `fmx catalog policy --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## policy

Read personal policy decisions and resolve HITL gates through platform authorization

```sh
fmx policy
```

## policy pending

Read your personal policy queue; permission to review is checked separately on decision

```sh
fmx policy pending [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Entries from the returned source window Default: `20`.
- `--offset <count>`: Offset within returned window Default: `0`.
- `--fields <csv>`: Output fields
- `--full`: Complete decision text and rule context

## policy decide

Record approve/reject/abort/adjust; durable resumption belongs to the backend and is not proven by a decision response

```sh
fmx policy decide <requestId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/policyEngine/hitl/resolve",
  "effects": [
    "write",
    "may-enqueue-work"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "oneOf": [
      {
        "type": "object",
        "properties": {
          "decision": {
            "type": "string",
            "enum": [
              "approve",
              "reject",
              "abort"
            ]
          },
          "reason": {
            "type": "string",
            "maxLength": 500
          }
        },
        "required": [
          "decision"
        ],
        "additionalProperties": false
      },
      {
        "type": "object",
        "properties": {
          "decision": {
            "type": "string",
            "const": "adjust"
          },
          "adjusted_payload": {
            "type": "object",
            "propertyNames": {
              "type": "string"
            },
            "additionalProperties": {}
          },
          "reason": {
            "type": "string",
            "maxLength": 500
          }
        },
        "required": [
          "decision",
          "adjusted_payload"
        ],
        "additionalProperties": false
      }
    ]
  }
}
```

