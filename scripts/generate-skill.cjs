const fs = require('node:fs');
const path = require('node:path');
const { guidance } = require('../dist/lib/home.js');
const content = `---
name: fmx
description: Inspect Fluxomind tenant metadata and records, authenticate, and develop or deploy extensions using the FMX CLI.
---

Use FMX for shell workflows. The platform's remote MCP is a separate interface with separate authentication.
Run \`npx -y @fluxomind/cli\` to inspect the current CLI context. Output defaults to TOON; use \`--format json\` for JSON.

${guidance.map(command => '- `' + command.replace(/^fmx/, 'npx -y @fluxomind/cli') + '`').join('\n')}

Tenant device login requires a UUID. Use --fields to select record fields and --full for complete text. Count is the current page size; total:null means the API did not supply a total.
Exit codes: 0 success or no-op; 1 runtime failure; 2 invalid usage. Progress goes to stderr. Consult each command's --help before mutations.
Session hooks are optional: install them only when requested with agents setup --scope project or --scope user.
`;
const target = path.resolve(__dirname, '../skills/fmx/SKILL.md');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
    console.error('FMX skill is stale. Run npm run build:cli && npm run skill:generate.'); process.exitCode = 1;
  }
} else fs.writeFileSync(target, content);
