# CLI reference — 0.5.0

Generated from the offline command catalog. Read only the group/section needed for the task. Examples use `fmx` as shorthand for the executable selected in SKILL.md. Placeholders must come from user intent or observed results. A listed command does not establish permission to run it.

## Global options

- `-V, --version`: output the version number
- `--dry-run`: Preview API-backed platform writes; reads may occur; auth/local setup are excluded
- `--read-only`: Permit GET only for platform commands; auth refresh is separate; legacy commands excluded
- `--format <format>`: Output format: toon, json, text Default: `"toon"`.

## All command groups

- [`init`](catalog/init.md): Scaffold a new extension project
- [`auth`](catalog/auth.md): Authenticate with Fluxomind Platform
- [`dev`](catalog/dev.md): Start development mode (watch + upload; acceptance is not deployment proof)
- [`deploy`](catalog/deploy.md): Deploy extension to the platform
- [`test`](catalog/test.md): Run tests in the remote Deno sandbox
- [`logs`](catalog/logs.md): View extension logs
- [`status`](catalog/status.md): Show extension status
- [`rollback`](catalog/rollback.md): Rollback to a previous version
- [`config`](catalog/config.md): Manage public CLI configuration
- [`dev-env`](catalog/dev-env.md): Configure local development environment (multi-IDE + AI clients + MCP)
- [`validate`](catalog/validate.md): Validate fluxomind.extension.toml against schema (exit 0 if valid, 1 if invalid)
- [`publish`](catalog/publish.md): Submit extension to marketplace (tenant default; --public for global)
- [`clone`](catalog/clone.md): Clone an existing extension from the tenant into a local folder
- [`link-repo`](catalog/link-repo.md): Link local extension to an existing remote repo without creating a new one
- [`model`](catalog/model.md): Model objects and fields through the platform modelling APIs
- [`apps`](catalog/apps.md): Discover tenant applications
- [`connections`](catalog/connections.md): Inspect integration connections without returning credentials
- [`jobs`](catalog/jobs.md): Inspect queue jobs; read-only operations
- [`knowledge`](catalog/knowledge.md): Inspect existing knowledge and ingest text through the platform retrieval service
- [`files`](catalog/files.md): Upload, inspect and link files through FileEngine; no local credential handling
- [`tenant`](catalog/tenant.md): Read authenticated tenant identity and quota
- [`access`](catalog/access.md): Inspect server-provided record capabilities; never infer write permission from a successful read
- [`resources`](catalog/resources.md): Declarative DataEngine record fields: validate, plan and conditionally apply; no automatic deletes
- [`dashboard`](catalog/dashboard.md): Read compact live context using GET only; partial failures remain visible
- [`policy`](catalog/policy.md): Read personal policy decisions and resolve HITL gates through platform authorization
- [`catalog`](catalog/catalog.md): Offline machine-readable command reference; no authentication or HTTP calls
- [`context`](catalog/context.md): Bind a workspace to a tenant locally; no credentials or remote calls
- [`doctor`](catalog/doctor.md): Offline context diagnostics; --remote explicitly enables read-only HTTP probes
- [`api`](catalog/api.md): Call an authenticated platform JSON API; no automatic mutation retries
- [`workflow`](catalog/workflow.md): Workflow definitions, action schemas, publishing and execution
- [`agent`](catalog/agent.md): Platform agents: CRUD, portable configuration and execution
- [`records`](catalog/records.md): Tenant records: CRUD, conditional writes, batches and aggregates
- [`agents`](catalog/agents.md): Opt-in AXI session integrations for Claude Code, Codex and OpenCode
- [`metadata`](catalog/metadata.md): Read tenant object and field metadata
- [`query`](catalog/query.md): Read records (default fields when present: id,name,api_name,status)

## Starting points from the CLI home

These suggestions share the CLI home source. Suggested writes and setup are not automatic bootstrap steps.

- `fmx auth login --device --tenant <tenant-uuid>`
- `fmx metadata list --limit 100`
- `fmx metadata view <object>`
- `fmx records list <object> --limit 20 --fields <field,field>`
- `fmx agent list`
- `fmx workflow actions list`
- `fmx workflow list`
- `fmx workflow validate --file <workflow.json>`
- `fmx workflow runs get <run-id>`
- `fmx catalog workflow`
- `fmx api GET /api/v1/openapi.json --format json`
- `fmx jobs list --limit 20`
- `fmx apps list`
- `fmx apps create --file <app.json> --dry-run`
- `fmx connections list`
- `fmx agents setup`
- `fmx dashboard`
- `fmx access record <object> <id>`
- `fmx catalog apps components create`
- `fmx agent workers list <id>`
- `fmx agent tools get <id>`
- `fmx knowledge status <id>`
- `fmx policy pending`
- `fmx jobs schedules list`
- `fmx resources validate --file <manifest.json>`
- `fmx --read-only resources plan --file <manifest.json> --remote --out <plan.json>`
- `fmx --read-only --dry-run resources apply --file <plan.json>`
