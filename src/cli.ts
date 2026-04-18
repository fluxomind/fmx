#!/usr/bin/env node

/**
 * fmx CLI — Fluxomind Platform Developer Tool
 * @package @fluxomind/cli
 */

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { authCommand } from './commands/auth';
import { devCommand } from './commands/dev';
import { deployCommand } from './commands/deploy';
import { testCommand } from './commands/test';
import { logsCommand } from './commands/logs';
import { statusCommand } from './commands/status';
import { rollbackCommand } from './commands/rollback';
import { configCommand } from './commands/config';
import { mcpCommand } from './commands/mcp';
import { devEnvCommand } from './commands/dev-env';
import { error } from './lib/output';

const program = new Command();

program
  .name('fmx')
  .description('Fluxomind Platform CLI — create, develop, deploy and manage extensions')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(authCommand);
program.addCommand(devCommand);
program.addCommand(deployCommand);
program.addCommand(testCommand);
program.addCommand(logsCommand);
program.addCommand(statusCommand);
program.addCommand(rollbackCommand);
program.addCommand(configCommand);
program.addCommand(mcpCommand);
program.addCommand(devEnvCommand);

program.parseAsync(process.argv).catch((err: Error) => {
  error(err.message);
  process.exit(1);
});
