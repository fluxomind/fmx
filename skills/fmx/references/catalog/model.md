# model — CLI 0.5.0

Generated from `fmx catalog model --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## model

Model objects and fields through the platform modelling APIs

```sh
fmx model
```

## model create-object

Create an object; payload uses name, api_name, display_name, description

```sh
fmx model create-object [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/modelling/objects",
  "effects": [
    "write"
  ],
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "minLength": 1
      },
      "api_name": {
        "type": "string",
        "minLength": 1
      },
      "display_name": {
        "type": "string",
        "minLength": 1
      },
      "description": {
        "type": "string"
      }
    },
    "required": [
      "name",
      "api_name"
    ],
    "additionalProperties": false
  },
  "serverAuthoritative": true,
  "validation": "Offline structure; platform validates authorization and semantics."
}
```

## model create-field

Create a field; payload uses apiName, displayName, dataType and field settings

```sh
fmx model create-field <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/modelling/objects/:object/fields/create",
  "effects": [
    "write"
  ],
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "apiName": {
        "type": "string",
        "minLength": 1
      },
      "displayName": {
        "type": "string",
        "minLength": 1
      },
      "dataType": {
        "type": "string",
        "minLength": 1
      },
      "isRequired": {
        "type": "boolean"
      },
      "sortOrder": {
        "type": "integer",
        "minimum": -9007199254740991,
        "maximum": 9007199254740991
      },
      "settings": {
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
      "description": {
        "type": "string"
      },
      "defaultValue": {},
      "maxLength": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "scale": {
        "type": "number",
        "minimum": 0
      },
      "maskingType": {
        "type": "string",
        "minLength": 1
      },
      "semanticType": {
        "type": "string",
        "minLength": 1
      },
      "formulaExpression": {
        "type": "string",
        "minLength": 1
      },
      "formulaReturnType": {
        "type": "string",
        "minLength": 1
      },
      "parentObjectApiName": {
        "type": "string",
        "minLength": 1
      },
      "relationshipType": {
        "type": "string",
        "minLength": 1
      },
      "onDelete": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "apiName",
      "displayName"
    ],
    "additionalProperties": false
  },
  "serverAuthoritative": true,
  "validation": "Offline structure; platform validates authorization and semantics."
}
```

## model restore-object

Restore a soft-retired object within the platform retention window

```sh
fmx model restore-object <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/modelling/objects/:object/restore",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## model export

Export comma-separated object names; platform source limits apply

```sh
fmx model export <objects> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--out <path>`: Save complete JSON with private permissions; refuses overwrite

## model import

Import object and field metadata; not a full app restore, no atomic rollback

```sh
fmx model import [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/modelling/import",
  "effects": [
    "write",
    "may-partially-apply"
  ],
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "version": {
        "type": "string"
      },
      "exportedAt": {
        "type": "string"
      },
      "objects": {
        "minItems": 1,
        "type": "array",
        "items": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        }
      }
    },
    "required": [
      "objects"
    ],
    "additionalProperties": false
  },
  "serverAuthoritative": true,
  "validation": "Structural input checks only; references remain server-controlled."
}
```

## model update-object

Update object labels or rename through the platform lifecycle gate

```sh
fmx model update-object <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "PATCH",
  "endpoint": "/api/services/modelling/objects/:object",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "display_name": {
        "type": "string",
        "minLength": 1
      },
      "description": {
        "type": "string"
      },
      "help_text": {
        "type": "string"
      },
      "category": {
        "type": "string",
        "minLength": 1
      },
      "api_name": {
        "type": "string",
        "minLength": 1
      },
      "reratificationGateId": {
        "type": "string",
        "minLength": 1
      },
      "display_icon": {
        "type": "string",
        "minLength": 1
      },
      "display_color": {
        "type": "string",
        "minLength": 1
      }
    },
    "additionalProperties": false
  }
}
```

## model update-field

Update or rename a field; server lifecycle gates are preserved

```sh
fmx model update-field <object> <fieldId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "PATCH",
  "endpoint": "/api/services/modelling/objects/:object/fields/:fieldId",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "display_name": {
        "type": "string",
        "minLength": 1
      },
      "description": {
        "type": "string"
      },
      "is_required": {
        "type": "boolean"
      },
      "default_value": {},
      "size": {
        "type": "number"
      },
      "scale": {
        "type": "number"
      },
      "ai_masking": {
        "type": "string",
        "minLength": 1
      },
      "semantic_type": {
        "type": "string",
        "minLength": 1
      },
      "display_order": {
        "type": "integer",
        "minimum": -9007199254740991,
        "maximum": 9007199254740991
      },
      "relationship_type": {
        "type": "string",
        "minLength": 1
      },
      "on_delete": {
        "type": "string",
        "minLength": 1
      },
      "api_name": {
        "type": "string",
        "minLength": 1
      },
      "settings": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      },
      "reratificationGateId": {
        "type": "string",
        "minLength": 1
      }
    },
    "additionalProperties": false
  }
}
```

## model retire-object

Soft-retire through platform lifecycle gates; backend may schedule a later purge

```sh
fmx model retire-object <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--gate <id>`: Existing reratification gate ID, if required

## model retire-field

Soft-retire through platform lifecycle gates; backend may schedule a later purge

```sh
fmx model retire-field <object> <fieldId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--gate <id>`: Existing reratification gate ID, if required

## model restore-field

Restore a field within the platform retention window

```sh
fmx model restore-field <object> <fieldId> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/services/modelling/objects/:object/fields/:fieldId/restore",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

