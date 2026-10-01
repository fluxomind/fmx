#!/usr/bin/env node
// Explicitly invoked authenticated smoke checks. Every child runs with the GET-only guard.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const commands = [
  ['metadata', 'view', 'fm__application', '--limit', '1'],
  ['access', 'object', 'fm__application'],
  ['jobs', 'types', 'list', '--limit', '1'],
  ['knowledge', 'list', '--limit', '1'],
  ['agent', 'tools', 'list'],
  ['workflow', 'approvals', 'list', '--limit', '1'],
  ['workflow', 'pending'],
  ['apps', 'list'],
  ['dashboard'],
];
const results = [];
for (const args of commands) {
  const start = Date.now();
  const child = spawnSync(process.execPath, [resolve(__dirname, '../dist/bin.js'), '--format', 'json', ...args], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, FMX_READ_ONLY: '1', FLUXOMIND_DISABLE_METRICS: '1' },
  });
  let output; try { output = JSON.parse(child.stdout); } catch { output = null; }
  const code = output?.code;
  const outcome = child.status === 0 ? 'passed' : code === 'PERMISSION_DENIED' ? 'denied' : 'failed';
  results.push({ command: ['fmx', ...args], outcome, exitCode: child.status, durationMs: Date.now() - start,
    ...(typeof output?.count === 'number' ? { count: output.count } : {}), ...(code ? { code } : {}), ...(output?.partial !== undefined ? { partial: output.partial } : {}) });
  process.stderr.write(`${outcome}: fmx ${args.join(' ')}\n`);
  if (code === 'AUTH_REQUIRED') break;
}
// Never copy tenant records, IDs, tokens or raw error bodies into the report.
process.stdout.write(JSON.stringify({ scope: 'authenticated-read-only-smoke', guard: 'FMX_READ_ONLY=1', resourceWritesPerformed: false, results }) + '\n');
if (results.some(r => r.outcome === 'failed')) process.exitCode = 1;
