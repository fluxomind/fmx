# apps — CLI 0.6.0

Generated from `fmx catalog apps --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## apps

Discover tenant applications

```sh
fmx apps
```

## apps delete

Delete a draft app and its verified exclusive resources; shared primitives are preserved

```sh
fmx apps delete <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--confirm <uuid>`: Required for execution: repeat the exact app UUID
- `--with-data`: Explicitly include destruction of data in exclusive objects
- `--include-object <uuid>`: Also include an explicitly approved object not linked to the app; repeat for each UUID Default: `[]`.
- `--expected-tenant <uuid>`: Require this verified remote tenant UUID, including for a default OAuth session
- `--remote`: With --dry-run: inventory the tenant using GET only
- `--progress`: Print inventory progress to stderr; JSON result stays on stdout
- `--out <path>`: Save the complete remote dry-run report; refuses overwrite
- `--receipt <path>`: Required for execution: private progress/result file; refuses overwrite

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "DELETE",
  "endpoint": "/api/v1/dataEngine?entityApiParam=:entity&id=:id",
  "effects": [
    "write",
    "deletes-exclusive-resources",
    "destroys-object-data",
    "native-cascades",
    "preserves-shared-primitives",
    "non-atomic-multi-request"
  ],
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "confirm": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "withData": {
        "type": "boolean"
      },
      "includeObjects": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "expectedTenant": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      }
    },
    "required": [
      "id"
    ],
    "additionalProperties": false
  },
  "serverAuthoritative": true,
  "validation": "Draft-only client preflight. Full visible graph, explicit data scope and matching confirmation required. Missing/inaccessible resources and unsupported dependencies block execution."
}
```

## apps list

List visible applications with compact identity and status

```sh
fmx apps list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Include server summaries

## apps get

Read the role-projected application manifest

```sh
fmx apps get <namespace> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete manifest text

## apps create

Create an app identity from JSON or instantiate a complete app from a published template

```sh
fmx apps create [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--template <id>`: Instantiate the template through the governed platform service; mutually exclusive with JSON
- `--dry-run`: Show the request without executing it; offline by default
- `--remote`: With --dry-run, check namespace or template catalog using GET only

## apps templates

List published templates available for complete app creation

```sh
fmx apps templates [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--category <name>`: Category filter
- `--full`: Complete template metadata

## apps schema

Offline JSON Schema for apps create input

```sh
fmx apps schema
```

## apps summary

Read role-projected app counts and recent activity

```sh
fmx apps summary <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

## apps home

Read app automations, assistant state and connection health

```sh
fmx apps home <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

## apps components

Compose existing pages through AppEngine; deletion removes the subtree

```sh
fmx apps components
```

## apps components tree

Read page component rows and parent links; --full includes layout and props

```sh
fmx apps components tree <pageId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text
- `--limit <count>`: Rows from the returned source window Default: `20`.
- `--offset <count>`: Offset within the returned source window Default: `0`.
- `--fields <csv>`: Output fields

## apps components create

Create a component on an existing page

```sh
fmx apps components create [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/appEngine/page-component",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "page_id": {
        "type": "string",
        "minLength": 1
      },
      "parent_id": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1
          },
          {
            "type": "null"
          }
        ]
      },
      "field_id": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1
          },
          {
            "type": "null"
          }
        ]
      },
      "component_type": {
        "type": "string",
        "minLength": 1
      },
      "display_order": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "props": {
        "anyOf": [
          {
            "type": "object",
            "propertyNames": {
              "type": "string"
            },
            "additionalProperties": {}
          },
          {
            "type": "null"
          }
        ]
      },
      "layout": {
        "anyOf": [
          {
            "type": "object",
            "propertyNames": {
              "type": "string"
            },
            "additionalProperties": {}
          },
          {
            "type": "null"
          }
        ]
      },
      "style": {
        "anyOf": [
          {
            "type": "object",
            "propertyNames": {
              "type": "string"
            },
            "additionalProperties": {}
          },
          {
            "type": "null"
          }
        ]
      },
      "visible": {
        "type": [
          "string",
          "null"
        ]
      },
      "disabled": {
        "type": [
          "string",
          "null"
        ]
      },
      "name": {
        "type": [
          "string",
          "null"
        ]
      }
    },
    "required": [
      "page_id",
      "component_type"
    ],
    "additionalProperties": false
  }
}
```

## apps components update

Patch a component; version enables server optimistic locking

```sh
fmx apps components update <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "PATCH",
  "endpoint": "/api/services/appEngine/page-component",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "page_id": {
        "type": "string",
        "minLength": 1
      },
      "parent_id": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1
          },
          {
            "type": "null"
          }
        ]
      },
      "field_id": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1
          },
          {
            "type": "null"
          }
        ]
      },
      "component_type": {
        "type": "string",
        "minLength": 1
      },
      "display_order": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "props": {
        "anyOf": [
          {
            "type": "object",
            "propertyNames": {
              "type": "string"
            },
            "additionalProperties": {}
          },
          {
            "type": "null"
          }
        ]
      },
      "layout": {
        "anyOf": [
          {
            "type": "object",
            "propertyNames": {
              "type": "string"
            },
            "additionalProperties": {}
          },
          {
            "type": "null"
          }
        ]
      },
      "style": {
        "anyOf": [
          {
            "type": "object",
            "propertyNames": {
              "type": "string"
            },
            "additionalProperties": {}
          },
          {
            "type": "null"
          }
        ]
      },
      "visible": {
        "type": [
          "string",
          "null"
        ]
      },
      "disabled": {
        "type": [
          "string",
          "null"
        ]
      },
      "name": {
        "type": [
          "string",
          "null"
        ]
      },
      "version": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      }
    },
    "additionalProperties": false
  }
}
```

## apps components delete

Delete a component and its descendants

```sh
fmx apps components delete <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "DELETE",
  "endpoint": "/api/services/appEngine/page-component",
  "effects": [
    "write",
    "deletes-subtree"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

