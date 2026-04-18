import { Command } from 'commander';
import { getConfigValue, setConfigValue, loadConfig } from '../lib/config-manager';
import { success, info, table } from '../lib/output';

export const configCommand = new Command('config')
  .description('Manage CLI configuration');

configCommand
  .command('get <key>')
  .description('Get a config value')
  .action((key: string) => {
    const value = getConfigValue(key as 'apiBaseUrl' | 'defaultTenant' | 'outputFormat');
    info(`${key} = ${value ?? '(not set)'}`);
  });

configCommand
  .command('set <key> <value>')
  .description('Set a config value')
  .action((key: string, value: string) => {
    setConfigValue(key as 'apiBaseUrl' | 'defaultTenant' | 'outputFormat', value);
    success(`${key} = ${value}`);
  });

configCommand
  .command('list')
  .description('List all config values')
  .action(() => {
    const config = loadConfig();
    table(Object.entries(config).map(([k, v]) => ({ key: k, value: String(v ?? '') })));
  });
