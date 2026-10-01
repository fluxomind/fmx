import { Command } from 'commander';
import { tenantOption, type JsonRecord } from '../lib/command-options';
import { listRecords } from '../lib/record-service';
import { get } from '../lib/api-client';
import { projectContext } from '../lib/project-context';
import { actionableError } from '../lib/actionable-error';
import { print } from '../lib/output';
import { projectRows } from './inspect';
export async function dashboard(tenant?: string, app?: string): Promise<void> {
  const project = projectContext(); const selected = tenant ?? project?.tenant;
  const checks: { name: string; run: () => Promise<unknown> }[] = [
    ...(['fm__workflow_definition', 'fm__agent'] as const).map(object => ({ name: object === 'fm__agent' ? 'agents' : 'workflows', run: async () => {
      const result = await listRecords(object, { tenant: selected, limit: 3, offset: 0 }, object === 'fm__agent' ? ['id', 'name', 'is_active'] : ['id', 'name', 'status']);
      if (!result.success) throw new Error(result.error ?? 'Read failed');
      return { count: Math.min(result.data.length, 3), total: result.rowLimit?.exact ? result.totalRecords ?? null : null, hasMore: result.data.length > 3, records: projectRows(result.data.slice(0, 3), object === 'fm__agent' ? ['id', 'name', 'is_active'] : ['id', 'name', 'status']).rows };
    } })),
    { name: 'jobs', run: async () => {
      const result = await get<{ data: { items: JsonRecord[] } }>('/api/v1/queueEngine/jobs?limit=4&offset=0', selected);
      return { count: Math.min(result.data.items.length, 3), hasMore: result.data.items.length > 3, jobs: result.data.items.slice(0, 3).map(j => ({ id: j.jobId, type: j.jobType, status: j.status })) };
    } },
  ];
  const application = app ?? project?.app;
  if (application) checks.push({ name: 'app-summary', run: async () => {
    const result = await get<JsonRecord>(`/api/services/appEngine/app-summary?${new URLSearchParams({ applicationId: application })}`, selected);
    if (result.status === 'error' || result.success === false) throw new Error(typeof result.error === 'string' ? result.error : 'App summary failed');
    return result;
  } });
  const results = await Promise.allSettled(checks.map(c => c.run()));
  const sections = results.map((r, i) => r.status === 'fulfilled' ? { name: checks[i].name, ok: true, data: r.value } : { name: checks[i].name, ok: false, error: (r.reason as Error).message, ...actionableError(r.reason as Error).fields });
  const partial = sections.some(s => !s.ok);
  print({ schemaVersion: 1, scope: 'read-only-live-context', tenant: selected ?? 'session-default', app: application ?? null, partial, sections,
    next: [{ command: 'fmx', args: ['workflow', 'list', ...(selected ? ['--tenant', selected] : [])] }, { command: 'fmx', args: ['jobs', 'list', ...(selected ? ['--tenant', selected] : [])] }] });
  if (partial) process.exitCode = 1;
}
export const dashboardCommand = tenantOption(new Command('dashboard').description('Read compact live context using GET only; partial failures remain visible'))
  .option('--app <id>', 'Include one role-projected app summary').action(async (opts: { tenant?: string; app?: string }) => dashboard(opts.tenant, opts.app));
