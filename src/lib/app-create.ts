import { z } from 'zod';
import { InvalidArgumentError } from 'commander';
import { createRecord, listRecords, recordPath } from './record-service';
import { type JsonRecord } from './command-options';
export const appCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), namespace: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(), icon: z.string().max(120).optional(),
  colorTheme: z.string().max(60).optional(), status: z.enum(['draft', 'published', 'archived']).default('draft'),
});
export async function createApp(input: JsonRecord, opts: { tenant?: string; dryRun?: boolean; remote?: boolean }): Promise<unknown> {
  const parsed = appCreateSchema.safeParse(input);
  if (!parsed.success) throw new InvalidArgumentError(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  if (opts.remote && !opts.dryRun) throw new InvalidArgumentError('--remote requires --dry-run; it performs read-only preflight');
  const { colorTheme, ...rest } = parsed.data;
  const payload = { ...rest, ...(colorTheme !== undefined ? { color_theme: colorTheme } : {}) };
  const plan = { method: 'POST', path: recordPath('fm__application'), body: { payload }, scope: 'application-record-only' };
  const preview = { dryRun: true, scope: opts.remote ? 'local-and-remote-read-only' : 'local-only', plan,
    writesPerformed: false, permissions: 'Write permission is checked by the server only on execution',
    warning: 'Creates the application identity only; pages, navigation and members are separate. Namespace lookup is not a transactional uniqueness guarantee.' };
  if (opts.dryRun && !opts.remote) return preview;
  const page = await listRecords('fm__application', { tenant: opts.tenant, limit: 1, offset: 0, filters: JSON.stringify({ namespace: { operator: 'eq', value: parsed.data.namespace } }) }, ['id', 'name', 'namespace', 'status']);
  if (page.success === false) throw new Error(page.error ?? 'Unable to check namespace');
  const existing = page.data[0];
  if (opts.dryRun) return { ...preview, existing: existing ?? null, plannedAction: existing ? 'noop' : 'create' };
  if (existing) return { application: existing, alreadyExists: true, noop: true, unchanged: true };
  const result = await createRecord('fm__application', payload, opts.tenant);
  if (result.success === false) return result;
  return { application: { id: result.id, name: result.name, namespace: result.namespace, status: result.status }, alreadyExists: false, help: `fmx records get fm__application ${result.id}` };
}
