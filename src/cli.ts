#!/usr/bin/env node
import { filesCommand, tenantCommand } from './commands/capabilities';

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
import { isDryRun, setDryRun, DryRunPreview } from './lib/dry-run';
import { configureOutput, print, error } from './lib/output';
import { VERSION } from './version';
import { home } from './lib/home';
import { workflowCommand } from './commands/workflow';
import { agentCommand } from './commands/agent';
import { apiCommand } from './commands/api';
import { recordsCommand } from './commands/records';
import { agentsCommand } from './commands/agents';
import { metadataCommand, queryCommand } from './commands/inspect';
import { actionableError } from './lib/actionable-error';
import { modelCommand, appsCommand, connectionsCommand, jobsCommand } from './commands/platform';
import { doctorCommand } from './commands/doctor';
import { contextCommand } from './commands/context';
import { catalogCommand } from './commands/catalog';
import { loadConfig } from './lib/config-manager';
import { registerPlatformExtensions } from './commands/platform-extensions';
import { knowledgeCommand } from './commands/knowledge';
import { accessCommand } from './commands/access';
import { isReadOnly, setReadOnly } from './lib/request-policy';
import { dashboard, dashboardCommand } from './commands/dashboard';
import { resourcesCommand } from './commands/resources';
import { projectContext } from './lib/project-context';
import { policyCommand } from './commands/policy';

const program = new Command();

program
  .name('fmx')
  .description('Fluxomind Platform CLI — build and operate apps, agents, workflows and extensions')
  .version(VERSION)
  .option('--dry-run', 'Preview API-backed platform writes; reads may occur; auth/local setup are excluded')
  .option('--read-only', 'Permit GET only for platform commands; auth refresh is separate; legacy commands excluded')
  .option('--format <format>', 'Output format: toon, json, text', 'toon')
  .action(async () => { const project = projectContext(); if (project?.liveContext) await dashboard(project.tenant, project.app); else home(); });

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

for (const command of [modelCommand, appsCommand, connectionsCommand, jobsCommand]) program.addCommand(command);
registerPlatformExtensions();
program.addCommand(knowledgeCommand);
program.addCommand(filesCommand);
program.addCommand(tenantCommand);
program.addCommand(accessCommand);
program.addCommand(resourcesCommand);
program.addCommand(dashboardCommand);
program.addCommand(policyCommand);
program.addCommand(catalogCommand(program));
program.addCommand(contextCommand);
program.addCommand(doctorCommand);
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
  setDryRun(Boolean(action.optsWithGlobals().dryRun));
  setReadOnly(Boolean(action.optsWithGlobals().readOnly));
  if (isDryRun() || isReadOnly()) {
    let top = action; while (top.parent && top.parent !== program) top = top.parent;
    if (!['fmx', 'api', 'records', 'workflow', 'agent', 'model', 'apps', 'connections', 'jobs', 'doctor', 'catalog', 'knowledge', 'access', 'metadata', 'resources', 'dashboard', 'policy', 'files', 'tenant'].includes(top.name())) action.error('--dry-run/--read-only are supported for API-backed platform commands, not authentication or local setup', { exitCode: 2 });
  }
});
// Usage failures can occur before preAction (unknown flags). Preserve the explicitly requested output format.
const formatIndex = process.argv.indexOf('--format');
configureOutput(formatIndex >= 0 && process.argv[formatIndex + 1] === 'json' || process.argv.includes('--format=json') || process.argv.includes('--json') ? 'json' : 'toon');
program.parseAsync(process.argv).catch((err: Error) => {
  if (err instanceof DryRunPreview) { print(err.preview); return; }
  if (err instanceof CommanderError && err.exitCode === 0) return;
  const usage = err instanceof CommanderError || err.name === 'InvalidArgumentError';
  const guidance = actionableError(err, process.argv.includes('workflow') ? process.argv[process.argv.indexOf('workflow') + 1] : undefined, process.argv);
  error(err.message, usage ? usageHelp ?? activeHelp ?? 'Use the command with --help to see valid arguments and flags.' : guidance.help,
    usage ? { code: 'INVALID_USAGE' } : guidance.fields);
  process.exitCode = usage ? 2 : 1;
});
