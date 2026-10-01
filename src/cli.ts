#!/usr/bin/env node

/**
 * fmx CLI — Fluxomind Platform Developer Tool
 * @package @fluxomind/cli
 */

import { Command, CommanderError } from 'commander';
import { initCommand } from './commands/init';
import { authCommand } from './commands/auth';
import { devCommand } from './commands/dev';
import { deployCommand } from './commands/deploy';
import { testCommand } from './commands/test';
import { logsCommand } from './commands/logs';
import { statusCommand } from './commands/status';
import { rollbackCommand } from './commands/rollback';
import { configCommand } from './commands/config';
import { devEnvCommand } from './commands/dev-env';
import { validateCommand } from './commands/validate';
import { publishCommand } from './commands/publish';
import { cloneCommand } from './commands/clone';
import { linkRepoCommand } from './commands/link-repo';
import { configureOutput, error } from './lib/output';
import { VERSION } from './version';
import { home } from './lib/home';
import { workflowCommand } from './commands/workflow';
import { agentCommand } from './commands/agent';
import { apiCommand } from './commands/api';
import { recordsCommand } from './commands/records';
import { agentsCommand } from './commands/agents';
import { metadataCommand, queryCommand } from './commands/inspect';
import { loadConfig } from './lib/config-manager';

const program = new Command();

program
  .name('fmx')
  .description('Fluxomind Platform CLI — create, develop, deploy and manage extensions')
  .version(VERSION)
  .option('--format <format>', 'Output format: toon, json, text', 'toon')
  .action(home);

program.addCommand(initCommand);
program.addCommand(authCommand);
program.addCommand(devCommand);
program.addCommand(deployCommand);
program.addCommand(testCommand);
program.addCommand(logsCommand);
program.addCommand(statusCommand);
program.addCommand(rollbackCommand);
program.addCommand(configCommand);
program.addCommand(devEnvCommand);
program.addCommand(validateCommand);
program.addCommand(publishCommand);
program.addCommand(cloneCommand);
program.addCommand(linkRepoCommand);

program.addCommand(apiCommand);
program.addCommand(workflowCommand);
program.addCommand(agentCommand);
program.addCommand(recordsCommand);
program.addCommand(agentsCommand);
program.addCommand(metadataCommand);
program.addCommand(queryCommand);
let usageHelp: string | undefined;
let activeHelp: string | undefined;
function configure(command: Command): void {
  command.exitOverride();
  command.configureOutput({ writeErr: () => undefined, outputError: () => { usageHelp = command.helpInformation(); } });
  for (const child of command.commands) configure(child);
}
configure(program);
program.hook('preAction', (_root, action) => {
  activeHelp = action.helpInformation();
  const requested = program.opts().format;
  const stored = loadConfig().outputFormat;
  const value = program.getOptionValueSource('format') === 'cli' ? requested : (stored === 'text' ? 'toon' : stored);
  if (!['toon', 'json', 'text'].includes(value)) program.error('--format must be toon, json or text', { exitCode: 2 });
  configureOutput(value);
});
// Usage failures can occur before preAction (unknown flags). Preserve the explicitly requested output format.
const formatIndex = process.argv.indexOf('--format');
configureOutput(formatIndex >= 0 && process.argv[formatIndex + 1] === 'json' || process.argv.includes('--format=json') || process.argv.includes('--json') ? 'json' : 'toon');
program.parseAsync(process.argv).catch((err: Error) => {
  if (err instanceof CommanderError && err.exitCode === 0) return;
  const usage = err instanceof CommanderError || err.name === 'InvalidArgumentError';
  error(err.message, usage ? usageHelp ?? activeHelp ?? 'Use the command with --help to see valid arguments and flags.' :
    err.name === 'AuthError' ? 'fmx auth login --device --tenant <tenant-uuid>' : undefined,
    !usage && 'statusCode' in err ? { status: (err as { statusCode: number }).statusCode, ...('code' in err && err.code ? { code: err.code } : {}), ...('details' in err && err.details ? { details: err.details } : {}) } : undefined);
  process.exitCode = usage ? 2 : 1;
});
