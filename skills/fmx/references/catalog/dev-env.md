# dev-env — CLI 0.5.0

Generated from `fmx catalog dev-env --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## dev-env

Configure local development environment (multi-IDE + AI clients + MCP)

```sh
fmx dev-env
```

## dev-env setup

Wizard: preflight → auth → pick AI clients → generate configs → smoke test

```sh
fmx dev-env setup [options]
```

- `--interactive`: Opt in to interactive setup prompts
- `--force`: Overwrite existing configs without prompting
- `--skip-smoke`: Skip the final fmx init + deploy smoke test
- `--ai-clients <csv>`: CI-friendly non-interactive mode — e.g. copilot,claude-code

## dev-env doctor

Validate environment without modifying files (idempotent)

```sh
fmx dev-env doctor
```

