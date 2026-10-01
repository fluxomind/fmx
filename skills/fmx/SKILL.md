---
name: fmx
description: Inspect Fluxomind tenant metadata and records, authenticate, and develop or deploy extensions using the FMX CLI.
---

Use FMX for shell workflows. The platform's remote MCP is a separate interface with separate authentication.
Run `npx -y @fluxomind/cli` to inspect the current CLI context. Output defaults to TOON; use `--format json` for JSON.

- `npx -y @fluxomind/cli auth login --device --tenant <tenant-uuid>`
- `npx -y @fluxomind/cli metadata list --limit 100`
- `npx -y @fluxomind/cli metadata view <object>`
- `npx -y @fluxomind/cli query <object> --limit 20 --fields <field,field>`
- `npx -y @fluxomind/cli agents setup`

Tenant device login requires a UUID. Use --fields to select record fields and --full for complete text. Count is the current page size; total:null means the API did not supply a total.
Exit codes: 0 success or no-op; 1 runtime failure; 2 invalid usage. Progress goes to stderr. Consult each command's --help before mutations.
Session hooks are optional: install them only when requested with agents setup --scope project or --scope user.
