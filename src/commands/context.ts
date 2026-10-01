import { Command, InvalidArgumentError } from 'commander';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectContext, projectContextSchema } from '../lib/project-context';
import { print } from '../lib/output';
import { resolveApiUrl } from '../lib/config-manager';
export const contextCommand = new Command('context').description('Bind a workspace to a tenant locally; no credentials or remote calls');
contextCommand.command('show').description('Read project context and API origin without authentication')
  .action(() => print({ project: projectContext() ?? null, api: resolveApiUrl(), help: 'fmx context init --tenant <tenant-uuid> --environment <test|development|production>' }));
contextCommand.command('init').description('Write .fmx/project.json in the current directory; refuses to overwrite')
  .requiredOption('--tenant <uuid>', 'Tenant UUID').requiredOption('--environment <name>', 'development, test or production')
  .action((opts: { tenant: string; environment: string }) => {
    const parsed = projectContextSchema.safeParse(opts); if (!parsed.success) throw new InvalidArgumentError('Expected --tenant UUID and --environment development, test or production');
    mkdirSync(resolve('.fmx'), { recursive: true }); const path = resolve('.fmx/project.json');
    writeFileSync(path, JSON.stringify(parsed.data, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); print({ ok: true, path, project: parsed.data });
  });
