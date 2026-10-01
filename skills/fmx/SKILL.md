---
name: fmx
description: Inspect or modify Fluxomind records, configure agents, build and execute workflows, authenticate, and develop extensions with FMX.
---

Use FMX for shell workflows. The platform's remote MCP is a separate interface with separate authentication.
Run `npx -y @fluxomind/cli@0.4.0-alpha.3` to inspect the current CLI context. Output defaults to TOON; use `--format json` for JSON.

- `npx -y @fluxomind/cli@0.4.0-alpha.3 auth login --device --tenant <tenant-uuid>`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 metadata list --limit 100`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 metadata view <object>`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 records list <object> --limit 20 --fields <field,field>`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 agent list`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 workflow actions list`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 workflow list`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 workflow validate --file <workflow.json>`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 workflow runs get <run-id>`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 catalog workflow`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 api GET /api/v1/openapi.json --format json`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 jobs list --limit 20`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 apps list`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 apps create --file <app.json> --dry-run`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 connections list`
- `npx -y @fluxomind/cli@0.4.0-alpha.3 agents setup`

Tenant device login requires a UUID. Use --fields to select record fields and --full for complete text. Count is the current page size; total:null means the API did not supply a total.
Exit codes: 0 success or no-op; 1 runtime failure; 2 invalid usage. Progress goes to stderr. Consult each command's --help before mutations. JSON payloads use --data or --file; --file - reads stdin. records update --expected enables compare-and-swap, while batches reject expectedValues. Partial batch failures preserve results and return exit 1. agent export --out writes the platform export without truncation; it does not promise all agent dependencies. workflow validate is offline by default; --remote only reads action schemas. workflow run --wait stops on completion or waiting; a wait timeout does not cancel the server run. workflow export --out writes lossless definition JSON. Use agent for platform agents; agents manages optional harness hooks.
Global --dry-run previews API-backed platform writes and redacts credentials; it stops before the first write, while prior reads may occur. Auth and local setup are excluded. apps create --template <id> delegates complete app instantiation to the governed template service. apps create with JSON requires name and namespace; it creates application identity only. --dry-run is local; adding --remote only reads namespace. A dry run does not prove write permission, and pages/navigation are separate.
Session hooks are optional: install them only when requested with agents setup --scope project or --scope user.
