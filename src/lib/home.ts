import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { getAuthStatus, getStoredTenants } from './auth-manager';
import { loadConfig, resolveApiUrl } from './config-manager';
import { projectContext } from './project-context';
import { VERSION } from '../version';
import { print } from './output';
export const guidance = [
  'fmx auth login --device --tenant <tenant-uuid>',
  'fmx metadata list --limit 100',
  'fmx metadata view <object>',
  'fmx records list <object> --limit 20 --fields <field,field>',
  'fmx agent list',
  'fmx workflow actions list',
  'fmx workflow list',
  'fmx workflow validate --file <workflow.json>',
  'fmx workflow runs get <run-id>',
  'fmx catalog workflow',
  'fmx api GET /api/v1/openapi.json --format json',
  'fmx jobs list --limit 20',
  'fmx apps list',
  'fmx apps create --file <app.json> --dry-run',
  'fmx connections list',
  'fmx agents setup',
];
export function home(): void {
  const config = loadConfig();
  const project = projectContext();
  const tenants = getStoredTenants().map(tenant => ({ tenant, authenticated: getAuthStatus(tenant).authenticated }));
  print({ bin: resolve(process.argv[1]).replace(homedir(), '~'), description: 'Develop Fluxomind extensions and inspect the active tenant', version: VERSION,
    cwd: process.cwd(), api: resolveApiUrl(), project: project ?? null, tenant: project?.tenant ?? config.defaultTenant ?? tenants[0]?.tenant ?? null,
    authentication: tenants, help: tenants.some(t => t.authenticated) ? guidance.slice(1, 5) : [guidance[0]] });
}
