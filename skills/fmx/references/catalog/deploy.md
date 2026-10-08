# deploy — CLI 0.6.0

Generated from `fmx catalog deploy --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## deploy

Deploy extension to the platform

```sh
fmx deploy [options]
```

- `-d, --dir <path>`: Project directory Default: `"."`.
- `--dry-run`: Validate and preview without deploying
- `--git`: Unsupported: Git deployment is not implemented
- `--env <environment>`: Target environment Default: `"production"`.
- `--version <semver>`: Override version
- `--force`: Bypass strict manifest validation for emergency hotfix (EVO-394 CA-9). Audit trail records deploy_source=cli_force

