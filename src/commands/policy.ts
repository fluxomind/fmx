import { Command } from 'commander';
import { z } from 'zod';
import { mutation } from '../lib/command-contract';
import { get } from '../lib/api-client';
import { fieldsOption, integer, tenantOption, type JsonRecord, type PayloadOptions } from '../lib/command-options';
import { print } from '../lib/output';
import { mutationResult } from '../lib/platform-output';
import { projectRows } from './inspect';
export const policyCommand = new Command('policy').description('Read personal policy decisions and resolve HITL gates through platform authorization');
tenantOption(policyCommand.command('pending').description('Read your personal policy queue; permission to review is checked separately on decision'))
  .option('--limit <count>', 'Entries from the returned source window', integer(1, 200), 20).option('--offset <count>', 'Offset within returned window', integer(0, Number.MAX_SAFE_INTEGER), 0)
  .option('--fields <csv>', 'Output fields').option('--full', 'Complete decision text and rule context')
  .action(async (opts: PayloadOptions & { limit: number; offset: number; fields?: string }) => {
    const fields = fieldsOption(opts.fields);
    const result = await get<JsonRecord>('/api/services/appEngine/user-pending-approvals', opts.tenant);
    if (result.success === false || result.status === 'error') { mutationResult({ ...result, success: false }); return; }
    const entries = result.approvals;
    if (!Array.isArray(entries)) throw new Error('Platform did not return a policy decision list');
    const page = entries.slice(opts.offset, opts.offset + opts.limit);
    const projected = projectRows(page, fields ?? (opts.full ? undefined : ['requestId', 'summary', 'severity', 'actionType']), opts.full);
    const hasMore = opts.offset + page.length < entries.length;
    print({ count: page.length, sourceCount: entries.length, total: null, hasMore, paginationScope: 'returned-source-window', sourceComplete: 'unknown', approvals: projected.rows, ...(projected.truncated ? { truncated: true, help: 'fmx policy pending --full' } : {}), ...(hasMore ? { next: { command: 'fmx', args: ['policy', 'pending', '--offset', String(opts.offset + page.length), '--limit', String(opts.limit), ...(opts.tenant ? ['--tenant', opts.tenant] : []), ...(opts.fields ? ['--fields', opts.fields] : []), ...(opts.full ? ['--full'] : [])] } } : {}) });
  });
const common = { reason: z.string().max(500).optional() };
mutation(policyCommand, { command: 'decide <requestId>', description: 'Record approve/reject/abort/adjust; durable resumption belongs to the backend and is not proven by a decision response', method: 'POST', endpoint: '/api/services/policyEngine/hitl/resolve', effects: ['write', 'may-enqueue-work'], schema: z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.enum(['approve', 'reject', 'abort']), ...common }),
  z.strictObject({ decision: z.literal('adjust'), adjusted_payload: z.record(z.string(), z.unknown()).refine(v => Object.keys(v).length > 0, 'Adjusted payload must be nonempty'), ...common }),
]), buildBody: (a, b) => ({ request_id: a[0], ...b }), transformResult: (result, body) => ({ ...result, requestedDecision: body?.decision, resumption: 'not-reported' }) });
