# init — CLI 0.6.0

Generated from `fmx catalog init --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## init

Scaffold a new extension project

```sh
fmx init <name> [options]
```

- `-t, --template <type>`: Template type: extension, trigger, module Default: `"extension"`.
- `--git`: Initialize Git repo (creates remote if GitHub App connected)
- `--git-provider <provider>`: Git provider: github (default) | gitlab | link — EVO-394 CA-11/12 Default: `"github"`.
- `--git-target <org-or-url>`: Organization (github/gitlab) or URL (link mode) — EVO-394
- `--public`: Create public repo (requires confirmation or --force)
- `--force`: Skip interactive confirmations (for CI)

