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
Session hooks are optional: install them only when requested with agents setup --scope project or --scope user.
`;
const target = path.resolve(__dirname, '../skills/fmx/SKILL.md');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
    console.error('FMX skill is stale. Run npm run build:cli && npm run skill:generate.'); process.exitCode = 1;
  }
} else fs.writeFileSync(target, content);
