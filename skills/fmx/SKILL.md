---
name: fmx
description: Inspect or modify Fluxomind records, configure agents, build and execute workflows, authenticate, and develop extensions with FMX.
---

Use FMX for shell workflows. The platform's remote MCP is a separate interface with separate authentication.
Run `npx -y @fluxomind/cli` to inspect the current CLI context. Output defaults to TOON; use `--format json` for JSON.

- `npx -y @fluxomind/cli auth login --device --tenant <tenant-uuid>`
- `npx -y @fluxomind/cli metadata list --limit 100`
- `npx -y @fluxomind/cli metadata view <object>`
- `npx -y @fluxomind/cli records list <object> --limit 20 --fields <field,field>`
- `npx -y @fluxomind/cli agent list`
- `npx -y @fluxomind/cli workflow actions list`
- `npx -y @fluxomind/cli workflow list`
- `npx -y @fluxomind/cli api GET /api/v1/openapi.json --format json`
- `npx -y @fluxomind/cli agents setup`

Tenant device login requires a UUID. Use --fields to select record fields and --full for complete text. Count is the current page size; total:null means the API did not supply a total.
Exit codes: 0 success or no-op; 1 runtime failure; 2 invalid usage. Progress goes to stderr. Consult each command's --help before mutations. JSON payloads use --data or --file; --file - reads stdin. records update --expected enables compare-and-swap, while batches reject expectedValues. Partial batch failures preserve results and return exit 1. agent export --out writes complete JSON without truncation. Use agent for platform agents; agents manages optional harness hooks.
Session hooks are optional: install them only when requested with agents setup --scope project or --scope user.
