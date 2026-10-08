# agents — CLI 0.6.0

Generated from `fmx catalog agents --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## agents

Opt-in AXI session integrations for Claude Code, Codex and OpenCode

```sh
fmx agents
```

## agents setup

Install or repair session hooks (explicit opt-in)

```sh
fmx agents setup [options]
```

- `--scope <scope>`: Integration scope: project or user Default: `"project"`.

## agents status

Inspect managed session hooks without changing files

```sh
fmx agents status [options]
```

- `--scope <scope>`: Integration scope: project or user Default: `"project"`.

## agents remove

Remove only FMX-managed session hooks

```sh
fmx agents remove [options]
```

- `--scope <scope>`: Integration scope: project or user Default: `"project"`.

