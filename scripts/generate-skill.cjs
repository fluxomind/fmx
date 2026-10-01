const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const invocation = 'npx -y @fluxomind/cli@' + version;
const { guidance } = require('../dist/lib/home.js');
const content = `---
name: fmx
description: Inspect or modify Fluxomind records, configure agents, build and execute workflows, authenticate, and develop extensions with FMX.
---

Use FMX for shell workflows. The platform's remote MCP is a separate interface with separate authentication.
Run \`${invocation}\` to inspect the current CLI context. Output defaults to TOON; use \`--format json\` for JSON.

${guidance.map(command => '- `' + command.replace(/^fmx/, invocation) + '`').join('\n')}

Tenant device login requires a UUID. Use --fields to select record fields and --full for complete text. Count is the current page size; total:null means the API did not supply a total.
Exit codes: 0 success or no-op; 1 runtime failure; 2 invalid usage. Progress goes to stderr. Consult each command's --help before mutations. JSON payloads use --data or --file; --file - reads stdin. records update --expected enables compare-and-swap, while batches reject expectedValues. Partial batch failures preserve results and return exit 1. agent export --out writes the platform export without truncation; it does not promise all agent dependencies. workflow validate is offline by default; --remote only reads action schemas. workflow run --wait stops on completion or waiting; a wait timeout does not cancel the server run. workflow export --out writes lossless definition JSON. Use agent for platform agents; agents manages optional harness hooks.
Global --dry-run previews API-backed platform writes and redacts credentials; it stops before the first write, while prior reads may occur. Auth and local setup are excluded. apps create --template <id> delegates complete app instantiation to the governed template service. apps create with JSON requires name and namespace; it creates application identity only. --dry-run is local; adding --remote only reads namespace. A dry run does not prove write permission, and pages/navigation are separate.
Use --read-only or FMX_READ_ONLY=1 for GET-only platform exploration. Legacy network paths and local/auth commands refuse this mode; OAuth refresh is separate. catalog exposes strict input schemas and effects for new domain writes, without claiming all older commands have schemas. access displays server record capabilities; it never infers create permission from a read. dashboard loads small live sections and preserves partial failures. context init --live-context is an explicit opt-in to live context on the no-args home; never enable it automatically.
apps components edits existing pages through AppEngine; version enables server conflict checking. Worker binding IDs and knowledge junction IDs differ from referenced agent/base IDs. agent tools set replaces the allowlist and uses platform model validation. knowledge ingest accepts text for an existing base; do not promise chunk/embedding options ignored by the route. Workflow approval tasks and policy HITL decisions are separate. A held model change is not applied. A policy decision response does not prove durable resumption. jobs wait observes without cancel/retry; schedules run-now and jobs retry execute work.
resources manifests manage customer record fields only. validate is offline; plan --remote reads schemas and current records. Plans pin tenant/API origin, reject ambiguous identities, unknown fields and credentials, and save baselines without overwrite. apply --dry-run sends no HTTP. Real apply rechecks all baselines and uses expectedValues, stops on partial failure and never automatically resumes or rolls back. Creates have no atomic uniqueness guarantee. System fm_ objects require domain commands. Keep manifests/plans with customer data outside git.
Session hooks are optional: install them only when requested with agents setup --scope project or --scope user.
`;
const target = path.resolve(__dirname, '../skills/fmx/SKILL.md');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
    console.error('FMX skill is stale. Run npm run build:cli && npm run skill:generate.'); process.exitCode = 1;
  }
} else fs.writeFileSync(target, content);
