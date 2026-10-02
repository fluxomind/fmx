# jobs — CLI 0.4.0

Generated from `fmx catalog jobs --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## jobs

Inspect queue jobs; read-only operations

```sh
fmx jobs
```

## jobs list

List jobs with lookahead; platform total is not an exact count

```sh
fmx jobs list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--status <status>`: Filter by job status
- `--type <name>`: Filter by job type
- `--limit <count>`: Page size Default: `50`.
- `--offset <count>`: Offset Default: `0`.
- `--fields <csv>`: Selected output fields

## jobs get

Read job status, diagnostics and execution details

```sh
fmx jobs get <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete text

## jobs cancel

Cancel a queue job with a required reason

```sh
fmx jobs cancel <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/jobs/:id/cancel",
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
    "required": [
      "reason"
    ],
    "additionalProperties": false
  }
}
```

## jobs retry

Retry a job; executes work again and is not a read-only diagnostic

```sh
fmx jobs retry <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/jobs/:id/retry",
  "effects": [
    "write",
    "executes-work"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## jobs reschedule

Reschedule a job using delayMs and optional reason

```sh
fmx jobs reschedule <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/jobs/:id/reschedule",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "delayMs": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "reason": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "delayMs"
    ],
    "additionalProperties": false
  }
}
```

## jobs wait

Observe an existing job using GET only; timeout does not cancel or retry it

```sh
fmx jobs wait <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--timeout <ms>`: Observation timeout Default: `60000`.
- `--interval <ms>`: Polling interval Default: `1000`.
- `--full`: Complete final job response

## jobs schedules

Manage queue schedules through RBAC-protected platform APIs

```sh
fmx jobs schedules
```

## jobs schedules get

Read schedule configuration and state

```sh
fmx jobs schedules get <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

## jobs schedules list

List schedule identities; total is unknown

```sh
fmx jobs schedules list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size Default: `20`.
- `--offset <count>`: Offset Default: `0`.
- `--status <status>`: active or paused
- `--type <key>`: Job type key
- `--include-archived`: Include archived schedules

## jobs schedules create

Create a schedule; timezone and recurrence are explicit

```sh
fmx jobs schedules create [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/schedules",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "minLength": 1
      },
      "timezone": {
        "type": "string",
        "minLength": 1
      },
      "recurrenceSpec": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "one_shot"
              },
              "run_at": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "mode",
              "run_at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "interval"
              },
              "every": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "unit": {
                "type": "string",
                "enum": [
                  "minute",
                  "hour"
                ]
              }
            },
            "required": [
              "mode",
              "every",
              "unit"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "daily"
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "weekly"
              },
              "days": {
                "minItems": 1,
                "maxItems": 7,
                "type": "array",
                "items": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 6
                }
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "days",
              "at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "monthly_day_of_month"
              },
              "day": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "day",
              "at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "monthly_nth_weekday"
              },
              "nth": {
                "anyOf": [
                  {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5
                  },
                  {
                    "type": "string",
                    "const": "last"
                  }
                ]
              },
              "weekday": {
                "type": "integer",
                "minimum": 0,
                "maximum": 6
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "nth",
              "weekday",
              "at"
            ],
            "additionalProperties": false
          }
        ]
      },
      "misfirePolicy": {
        "type": "string",
        "enum": [
          "only_next",
          "catch_up",
          "run_immediately",
          "skip"
        ]
      },
      "maxCatchUp": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "jobPayloadTemplate": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      },
      "description": {
        "type": "string"
      },
      "jobTypeKey": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "name",
      "timezone",
      "recurrenceSpec",
      "jobTypeKey"
    ],
    "additionalProperties": false
  }
}
```

## jobs schedules update

Update schedule configuration; preserves platform enqueue gates

```sh
fmx jobs schedules update <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "PATCH",
  "endpoint": "/api/v1/queueEngine/schedules/:id",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "minLength": 1
      },
      "timezone": {
        "type": "string",
        "minLength": 1
      },
      "recurrenceSpec": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "one_shot"
              },
              "run_at": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "mode",
              "run_at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "interval"
              },
              "every": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "unit": {
                "type": "string",
                "enum": [
                  "minute",
                  "hour"
                ]
              }
            },
            "required": [
              "mode",
              "every",
              "unit"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "daily"
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "weekly"
              },
              "days": {
                "minItems": 1,
                "maxItems": 7,
                "type": "array",
                "items": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 6
                }
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "days",
              "at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "monthly_day_of_month"
              },
              "day": {
                "type": "integer",
                "minimum": 1,
                "maximum": 31
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "day",
              "at"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "mode": {
                "type": "string",
                "const": "monthly_nth_weekday"
              },
              "nth": {
                "anyOf": [
                  {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5
                  },
                  {
                    "type": "string",
                    "const": "last"
                  }
                ]
              },
              "weekday": {
                "type": "integer",
                "minimum": 0,
                "maximum": 6
              },
              "at": {
                "type": "string",
                "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$"
              }
            },
            "required": [
              "mode",
              "nth",
              "weekday",
              "at"
            ],
            "additionalProperties": false
          }
        ]
      },
      "misfirePolicy": {
        "type": "string",
        "enum": [
          "only_next",
          "catch_up",
          "run_immediately",
          "skip"
        ]
      },
      "maxCatchUp": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9007199254740991
      },
      "jobPayloadTemplate": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      },
      "description": {
        "type": "string"
      }
    },
    "additionalProperties": false
  }
}
```

## jobs schedules pause

Pause future schedule ticks

```sh
fmx jobs schedules pause <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/schedules/:id/pause",
  "effects": [
    "write"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## jobs schedules resume

resume a schedule through the platform service

```sh
fmx jobs schedules resume <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/schedules/:id/resume",
  "effects": [
    "write",
    "schedules-work"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## jobs schedules run-now

run-now a schedule through the platform service

```sh
fmx jobs schedules run-now <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/schedules/:id/run-now",
  "effects": [
    "write",
    "executes-work"
  ],
  "serverAuthoritative": true,
  "validation": "JSON Schema describes structure. Additional semantic checks run in the CLI and platform."
}
```

## jobs schedules archive

Archive a schedule with an audit reason

```sh
fmx jobs schedules archive <id> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--data <json>`: JSON payload
- `--file <path>`: JSON file; - reads stdin
- `--full`: Complete response text

Declared contract (local CLI; server authorization remains authoritative):

```json
{
  "method": "POST",
  "endpoint": "/api/v1/queueEngine/schedules/:id/archive",
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
    "required": [
      "reason"
    ],
    "additionalProperties": false
  }
}
```

## jobs types

Discover enabled job types and their input contracts

```sh
fmx jobs types
```

## jobs types get

Read job type schema and enablement

```sh
fmx jobs types get <key> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--full`: Complete response text

## jobs types list

List job types; total is unknown

```sh
fmx jobs types list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size Default: `50`.
- `--offset <count>`: Offset Default: `0`.

