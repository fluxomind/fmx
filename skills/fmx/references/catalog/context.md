# context — CLI 0.6.0

Generated from `fmx catalog context --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## context

Bind a workspace to a tenant locally; no credentials or remote calls

```sh
fmx context
```

## context show

Read project context and API origin without authentication

```sh
fmx context show
```

## context init

Write .fmx/project.json in the current directory; refuses to overwrite

```sh
fmx context init [options]
```

- `--tenant <uuid>`: Tenant UUID Required.
- `--environment <name>`: development, test or production Required.
- `--app <uuid>`: App UUID for the live dashboard
- `--live-context`: Opt in to GET-only live context when running fmx without arguments

