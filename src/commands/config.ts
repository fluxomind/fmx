import { Command } from 'commander';
import { getConfigValue, setConfigValue, loadConfig } from '../lib/config-manager';
import { print } from '../lib/output';
const keys = ['apiBaseUrl', 'defaultTenant', 'outputFormat'] as const;
type PublicKey = typeof keys[number];
export const configCommand = new Command('config').description('Manage public CLI configuration');
function validateKey(key: string, command: Command): asserts key is PublicKey {
  if (!keys.includes(key as PublicKey)) command.error(`Unknown public config key: ${key}. Valid keys: ${keys.join(', ')}`, { exitCode: 2 });
}
configCommand.command('get <key>').description('Get a public config value').action((key: string, _opts, command: Command) => {
  validateKey(key, command);
  print({ key, value: getConfigValue(key) ?? null });
});
configCommand.command('set <key> <value>').description('Set a public config value').action((key: string, value: string, _opts, command: Command) => {
  validateKey(key, command);
  if (key === 'outputFormat' && !['toon', 'json', 'text'].includes(value)) command.error('outputFormat must be toon, json or text', { exitCode: 2 });
  if (key === 'apiBaseUrl') {
    try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol)) throw new Error(); }
    catch { command.error('apiBaseUrl must be an HTTP(S) URL', { exitCode: 2 }); }
  }
  setConfigValue(key, value);
  print({ ok: true, key, value });
});
configCommand.command('list').description('List public config values (credentials are excluded)').action(() => {
  const config = loadConfig();
  print(Object.fromEntries(keys.map(key => [key, config[key] ?? null])));
});
