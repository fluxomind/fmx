import { Command } from 'commander';
import { resolve } from 'node:path';
import { print } from '../lib/output';
// Preserve native dynamic import in the CommonJS build (the SDK is ESM-only).
const loadSdk = new Function('return import("axi-sdk-js")') as () => Promise<{
  installSessionStartHooks(options: Record<string, unknown>): void;
  sessionStartHookStatus(options: Record<string, unknown>): unknown;
  uninstallSessionStartHooks(options: Record<string, unknown>): void;
}>;
export const agentsCommand = new Command('agents').description('Opt-in AXI session integrations for Claude Code, Codex and OpenCode');
for (const operation of ['setup', 'status', 'remove'] as const) {
  agentsCommand.command(operation)
    .description(operation === 'setup' ? 'Install or repair session hooks (explicit opt-in)' : operation === 'status' ? 'Inspect managed session hooks without changing files' : 'Remove only FMX-managed session hooks')
    .option('--scope <scope>', 'Integration scope: project or user', 'project')
    .action(async (opts: { scope: string }, command: Command) => {
      if (!['project', 'user'].includes(opts.scope)) command.error('--scope must be project or user', { exitCode: 2 });
      const sdk = await loadSdk();
      const failures: string[] = [];
      const options = { marker: 'fmx', execPath: resolve(process.argv[1]), binaryNames: ['fmx'], distEntrypoints: ['dist/bin.js'],
        scope: opts.scope, projectDir: process.cwd(), shouldInstall: () => true, onError: (message: string) => failures.push(message) };
      if (operation === 'setup') sdk.installSessionStartHooks(options);
      if (operation === 'remove') sdk.uninstallSessionStartHooks(options);
      if (failures.length) throw new Error(failures.join('; '));
      print({ ok: true, operation, integrations: sdk.sessionStartHookStatus(options) });
    });
}
