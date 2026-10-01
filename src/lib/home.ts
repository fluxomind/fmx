import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { getAuthStatus, getStoredTenants } from './auth-manager';
import { loadConfig, resolveApiUrl } from './config-manager';
import { VERSION } from '../version';
import { print } from './output';
export const guidance = [
  'fmx auth login --device --tenant <tenant-uuid>',
  'fmx metadata list --limit 100',
  'fmx metadata view <object>',
  'fmx query <object> --limit 20 --fields <field,field>',
  'fmx agents setup',
];
export function home(): void {
  const config = loadConfig();
  const tenants = getStoredTenants().map(tenant => ({ tenant, authenticated: getAuthStatus(tenant).authenticated }));
  print({ bin: resolve(process.argv[1]).replace(homedir(), '~'), description: 'Develop Fluxomind extensions and inspect the active tenant', version: VERSION,
    cwd: process.cwd(), api: resolveApiUrl(), tenant: config.defaultTenant ?? tenants[0]?.tenant ?? null,
    authentication: tenants, help: tenants.some(t => t.authenticated) ? guidance.slice(1) : [guidance[0]] });
}
