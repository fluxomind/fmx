import { Command } from 'commander';
import { z } from 'zod';
import { apiRequest, get } from '../lib/api-client';
import { domainResult, mutation } from '../lib/command-contract';
import { fieldsOption, integer, pathPart, tenantOption, type JsonRecord, type PayloadOptions } from '../lib/command-options';
import { print } from '../lib/output';
import { compact, detail, mutationResult } from '../lib/platform-output';
import { actionableError } from '../lib/actionable-error';
import { projectRows } from './inspect';
import { appsCommand, jobsCommand, modelCommand } from './platform';
import { agentCommand } from './agent';
import { workflowCommand } from './workflow';
import { poll } from '../lib/poll';
const text = z.string().trim().min(1);
const object = z.record(z.string(), z.unknown());
function read(parent: Command, command: string, description: string, endpoint: (args: string[]) => string, key?: string, fields?: string[], sourceLimit?: number): void {
  const leaf = tenantOption(parent.command(command).description(description)).option('--full', 'Complete response text');
  if (key) leaf.option('--limit <count>', 'Rows from the returned source window', integer(1, 500), 20).option('--offset <count>', 'Offset within the returned source window', integer(0, Number.MAX_SAFE_INTEGER), 0).option('--fields <csv>', 'Output fields');
  leaf.action(async (...values: unknown[]) => {
    const opts = values.at(-2) as PayloadOptions & { limit: number; offset: number; fields?: string };
    const args = values.slice(0, -2) as string[];
    const selectedFields = fieldsOption(opts.fields);
    const result = await get<JsonRecord>(endpoint(args), opts.tenant);
    if (result.success === false || result.status === 'error') { mutationResult({ ...result, success: false }); return; }
    if (key && Array.isArray(result[key])) {
      const rows = result[key] as JsonRecord[];
      const page = rows.slice(opts.offset, opts.offset + opts.limit); const hasMore = opts.offset + page.length < rows.length;
      const path: string[] = []; let current: Command | null = leaf; while (current?.parent) { path.unshift(current.name()); current = current.parent; }
      const nextArgs = [...path, ...args, '--offset', String(opts.offset + page.length), '--limit', String(opts.limit), ...(opts.tenant ? ['--tenant', opts.tenant] : []), ...(opts.fields ? ['--fields', opts.fields] : []), ...(opts.full ? ['--full'] : [])];
      const projected = projectRows(page, selectedFields ?? (opts.full ? undefined : fields), opts.full);
      print({ count: page.length, total: null, sourceCount: rows.length, paginationScope: 'returned-source-window', fieldProjection: 'local', networkPagination: false, sourceComplete: 'unknown', offset: opts.offset, hasMore, ...(sourceLimit ? { sourceLimit } : {}), [key]: projected.rows,
        ...(projected.truncated ? { truncated: true, help: 'Use the same command with --full' } : {}), ...(hasMore ? { next: { command: 'fmx', args: nextArgs } } : {}) });
    } else detail(result, opts.full, 'Use the same command with --full');
  });
}
export function registerPlatformExtensions(): void {
  read(appsCommand, 'summary <id>', 'Read role-projected app counts and recent activity', a => `/api/services/appEngine/app-summary?${new URLSearchParams({ applicationId: a[0] })}`);
  read(appsCommand, 'home <id>', 'Read app automations, assistant state and connection health', a => `/api/services/appEngine/app-home?${new URLSearchParams({ applicationId: a[0] })}`);
  const components = appsCommand.command('components').description('Compose existing pages through AppEngine; deletion removes the subtree');
  read(components, 'tree <pageId>', 'Read page component rows and parent links; --full includes layout and props', a => `/api/services/appEngine/page-component/tree?${new URLSearchParams({ pageId: a[0] })}`, 'data', ['id', 'component_type', 'parent_id', 'version']);
  const props = {
    page_id: text, parent_id: text.nullable().optional(), field_id: text.nullable().optional(), component_type: text,
    display_order: z.number().int().nonnegative().optional(), props: object.nullable().optional(), layout: object.nullable().optional(), style: object.nullable().optional(),
    visible: z.string().nullable().optional(), disabled: z.string().nullable().optional(), name: z.string().nullable().optional(),
  };
  mutation(components, { command: 'create', description: 'Create a component on an existing page', method: 'POST', endpoint: '/api/services/appEngine/page-component', schema: z.strictObject(props) });
  mutation(components, { command: 'update <id>', description: 'Patch a component; version enables server optimistic locking', method: 'PATCH', endpoint: '/api/services/appEngine/page-component', schema: z.strictObject(props).partial().extend({ version: z.number().int().nonnegative().optional() }).refine(v => Object.keys(v).length > 0, 'Provide at least one update'), buildBody: (a, b) => ({ id: a[0], ...b }) });
  mutation(components, { command: 'delete <id>', description: 'Delete a component and its descendants', method: 'DELETE', endpoint: '/api/services/appEngine/page-component', effects: ['write', 'deletes-subtree'], buildBody: a => ({ id: a[0] }) });

  const workers = agentCommand.command('workers').description('Manage delegated worker bindings; binding IDs differ from worker agent IDs');
  const workerBase = (id: string) => `/api/agent-studio/agents/${pathPart(id)}/workers`;
  read(workers, 'list <id>', 'List worker bindings for an agent', a => workerBase(a[0]), 'workers', ['id', 'workerId', 'workerName', 'isActive']);
  read(workers, 'available <id>', 'List worker candidates; backend may return an empty list after a read failure', a => workerBase(a[0]) + '/available', 'agents', ['id', 'name', 'pattern']);
  mutation(workers, { command: 'link <id>', description: 'Bind an existing worker agent', method: 'POST', endpoint: '/api/agent-studio/agents/:id/workers', schema: z.strictObject({ workerId: text, displayOrder: z.number().int().nonnegative().optional(), isActive: z.boolean().optional() }) });
  mutation(workers, { command: 'update <id> <bindingId>', description: 'Configure a worker binding; ownership enforced by the platform', method: 'PUT', endpoint: '/api/agent-studio/agents/:id/workers/:bindingId', schema: z.strictObject({ alias: text.optional(), toolPrefixes: z.array(text).nullable().optional(), displayOrder: z.number().int().nonnegative().optional(), isActive: z.boolean().optional() }).refine(v => Object.keys(v).length > 0, 'Provide at least one update') });
  mutation(workers, { command: 'unlink <id> <bindingId>', description: 'Remove a worker binding; preserves the worker agent', method: 'DELETE', endpoint: '/api/agent-studio/agents/:id/workers/:bindingId' });
  const knowledge = agentCommand.commands.find(c => c.name() === 'knowledge')!;
  read(knowledge, 'available <id>', 'List knowledge not yet linked; source is capped at 500', a => `/api/agent-studio/agents/${pathPart(a[0])}/knowledge/available`, 'data', ['id', 'name', 'type', 'sourceType'], 500);
  mutation(knowledge, { command: 'unlink <id> <junctionId>', description: 'Remove a knowledge binding; preserves documents', method: 'DELETE', endpoint: '/api/agent-studio/agents/:id/knowledge/:junctionId' });
  const tools = agentCommand.command('tools').description('Discover the tenant tool catalog; listing does not prove execute permission');
  read(tools, 'list', 'List tenant tool identities; capped at 200', () => '/api/agent-studio/tools', 'tools', ['id', 'name', 'category'], 200);
  tenantOption(tools.command('get <id>').description('Read the agent tool allowlist')).action(async (id: string, opts: PayloadOptions) => {
    const agent = await get<JsonRecord>(`/api/agent-studio/agents/${pathPart(id)}`, opts.tenant);
    print({ id: agent.id, name: agent.name, tools: agent.tools });
  });
  mutation(tools, { command: 'set <id>', description: 'Replace the agent tool allowlist; model compatibility is validated by the platform', method: 'PUT', endpoint: '/api/agent-studio/agents/:id', schema: z.strictObject({ tools: z.array(text) }) });

  const approvals = workflowCommand.command('approvals').description('Operate workflow approval tasks through the governed approval service');
  tenantOption(approvals.command('list').description('Read pending workflow approval tasks')).option('--limit <count>', 'Maximum tasks', integer(1, 200), 20).option('--full', 'Complete task text').action(async (opts: PayloadOptions & { limit: number }) => {
    const result = await get<JsonRecord>(`/api/workflow/approvals?limit=${opts.limit}`, opts.tenant);
    if (result.success === false) { mutationResult(result); return; }
    detail(result, opts.full, 'fmx workflow approvals list --full');
  });
  for (const action of ['approve', 'reject', 'recall', 'delegate'] as const) {
    mutation(approvals, { command: `${action} <taskId>`, description: `${action} an approval task; policy and ownership checked by the server`, method: 'POST', endpoint: '/api/workflow/approvals',
      schema: z.strictObject({ reason: text.optional(), ...(action === 'delegate' ? { toUserId: text, notificationRecipientDestination: text.optional() } : {}) }),
      buildBody: (a, b) => ({ taskId: a[0], action, ...b }) });
  }
  read(workflowCommand, 'pending', 'Read your personal policy decision queue; separate from workflow approval tasks', () => '/api/services/appEngine/user-pending-approvals', 'approvals', ['requestId', 'summary', 'severity', 'actionType']);
  read(workflowCommand, 'run-actions <runId>', 'Read available workflow actions; backend remains authoritative', a => `/api/v1/workflow/${pathPart(a[0])}/actions`);
  mutation(jobsCommand, { command: 'cancel <id>', description: 'Cancel a queue job with a required reason', method: 'POST', endpoint: '/api/v1/queueEngine/jobs/:id/cancel', schema: z.strictObject({ reason: text }) });
  mutation(jobsCommand, { command: 'retry <id>', description: 'Retry a job; executes work again and is not a read-only diagnostic', method: 'POST', endpoint: '/api/v1/queueEngine/jobs/:id/retry', effects: ['write', 'executes-work'] });
  mutation(jobsCommand, { command: 'reschedule <id>', description: 'Reschedule a job using delayMs and optional reason', method: 'POST', endpoint: '/api/v1/queueEngine/jobs/:id/reschedule', schema: z.strictObject({ delayMs: z.number().int().nonnegative(), reason: text.optional() }) });
  tenantOption(jobsCommand.command('wait <id>').description('Observe an existing job using GET only; timeout does not cancel or retry it'))
    .option('--timeout <ms>', 'Observation timeout', integer(1, 3600000), 60000).option('--interval <ms>', 'Polling interval', integer(10, 60000), 1000).option('--full', 'Complete final job response').action(async (id: string, opts: PayloadOptions & { timeout: number; interval: number }) => {
      try {
        const result = await poll({ timeout: opts.timeout, interval: opts.interval, read: async remaining => {
          const response = await apiRequest<{ success?: boolean; data?: JsonRecord }>({ method: 'GET', path: `/api/v1/queueEngine/jobs/${pathPart(id)}`, tenant: opts.tenant, timeout: remaining, retries: 0 });
          if (response.success === false || !response.data || response.data.jobId !== id) throw new Error('Platform did not return the requested job');
          return response.data;
        }, stopped: job => ['completed', 'failed', 'cancelled'].includes(String(job.status)) });
        if (result.outcome === 'timeout') { print({ jobId: id, outcome: 'timeout', continuesOnServer: true, help: `fmx jobs get ${id}` }); process.exitCode = 1; return; }
        const job = result.value;
        print({ jobId: id, outcome: job.status, job: opts.full ? job : projectRows([job], ['jobId', 'jobType', 'status', 'progress', 'attempts']).rows[0], ...(job.error ? { error: compact(job.error, opts.full).data, help: `fmx jobs get ${id} --full` } : {}) });
        if (job.status !== 'completed') process.exitCode = 1;
      } catch (err) { print({ jobId: id, outcome: 'observation_failed', error: (err as Error).message, ...actionableError(err as Error).fields, help: `fmx jobs get ${id}`, continuesOnServer: true }); process.exitCode = 1; }
    });
  const schedules = jobsCommand.command('schedules').description('Manage queue schedules through RBAC-protected platform APIs');
  read(schedules, 'get <id>', 'Read schedule configuration and state', a => `/api/v1/queueEngine/schedules/${pathPart(a[0])}`);
  tenantOption(schedules.command('list').description('List schedule identities; total is unknown')).option('--limit <count>', 'Page size', integer(1, 199), 20).option('--offset <count>', 'Offset', integer(0, Number.MAX_SAFE_INTEGER), 0)
    .option('--status <status>', 'active or paused').option('--type <key>', 'Job type key').option('--include-archived', 'Include archived schedules').action(async (opts: PayloadOptions & { limit: number; offset: number; status?: string; type?: string; includeArchived?: boolean }) => {
      const params = new URLSearchParams({ limit: String(opts.limit + 1), offset: String(opts.offset), includeArchived: String(Boolean(opts.includeArchived)) });
      if (opts.status) params.set('status', opts.status); if (opts.type) params.set('jobType', opts.type);
      const result = await get<{ data: { items: JsonRecord[] } }>(`/api/v1/queueEngine/schedules?${params}`, opts.tenant); const rows = result.data.items;
      const args = ['jobs', 'schedules', 'list', '--limit', String(opts.limit), '--offset', String(opts.offset + opts.limit)];
      for (const [flag, value] of [['--tenant', opts.tenant], ['--status', opts.status], ['--type', opts.type]]) if (value) args.push(flag!, value);
      if (opts.includeArchived) args.push('--include-archived');
      print({ count: Math.min(rows.length, opts.limit), total: null, hasMore: rows.length > opts.limit, schedules: projectRows(rows.slice(0, opts.limit), ['scheduleId', 'name', 'status', 'nextRunAt']).rows, ...(rows.length > opts.limit ? { next: { command: 'fmx', args } } : {}) });
    });
  const at = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const recurrence = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('one_shot'), run_at: text }),
    z.strictObject({ mode: z.literal('interval'), every: z.number().int().positive(), unit: z.enum(['minute', 'hour']) }),
    z.strictObject({ mode: z.literal('daily'), at }),
    z.strictObject({ mode: z.literal('weekly'), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), at }),
    z.strictObject({ mode: z.literal('monthly_day_of_month'), day: z.number().int().min(1).max(31), at }),
    z.strictObject({ mode: z.literal('monthly_nth_weekday'), nth: z.union([z.number().int().min(1).max(5), z.literal('last')]), weekday: z.number().int().min(0).max(6), at }),
  ]);
  const scheduleProps = { name: text, timezone: text, recurrenceSpec: recurrence, misfirePolicy: z.enum(['only_next', 'catch_up', 'run_immediately', 'skip']).optional(), maxCatchUp: z.number().int().nonnegative().optional(), jobPayloadTemplate: object.optional(), description: z.string().optional() };
  mutation(schedules, { command: 'create', description: 'Create a schedule; timezone and recurrence are explicit', method: 'POST', endpoint: '/api/v1/queueEngine/schedules', schema: z.strictObject({ ...scheduleProps, jobTypeKey: text }) });
  mutation(schedules, { command: 'update <id>', description: 'Update schedule configuration; preserves platform enqueue gates', method: 'PATCH', endpoint: '/api/v1/queueEngine/schedules/:id', schema: z.strictObject(scheduleProps).partial().refine(v => Object.keys(v).length > 0, 'Provide at least one update') });
  mutation(schedules, { command: 'pause <id>', description: 'Pause future schedule ticks', method: 'POST', endpoint: '/api/v1/queueEngine/schedules/:id/pause' });
  for (const action of ['resume', 'run-now'] as const) mutation(schedules, { command: `${action} <id>`, description: `${action} a schedule through the platform service`, method: 'POST', endpoint: `/api/v1/queueEngine/schedules/:id/${action}`, effects: ['write', action === 'run-now' ? 'executes-work' : 'schedules-work'] });
  mutation(schedules, { command: 'archive <id>', description: 'Archive a schedule with an audit reason', method: 'POST', endpoint: '/api/v1/queueEngine/schedules/:id/archive', schema: z.strictObject({ reason: text }) });
  const types = jobsCommand.command('types').description('Discover enabled job types and their input contracts');
  read(types, 'get <key>', 'Read job type schema and enablement', a => `/api/v1/queueEngine/job-types/${pathPart(a[0])}`);
  tenantOption(types.command('list').description('List job types; total is unknown')).option('--limit <count>', 'Page size', integer(1, 199), 50).option('--offset <count>', 'Offset', integer(0, Number.MAX_SAFE_INTEGER), 0).action(async (opts: PayloadOptions & { limit: number; offset: number }) => {
    const result = await get<{ data: { items: JsonRecord[] } }>(`/api/v1/queueEngine/job-types?limit=${opts.limit + 1}&offset=${opts.offset}`, opts.tenant);
    const rows = result.data.items;
    print({ count: Math.min(rows.length, opts.limit), total: null, hasMore: rows.length > opts.limit, types: projectRows(rows.slice(0, opts.limit), ['jobTypeKey', 'label', 'status', 'tenantEnabled']).rows, ...(rows.length > opts.limit ? { next: { command: 'fmx', args: ['jobs', 'types', 'list', '--limit', String(opts.limit), '--offset', String(opts.offset + opts.limit), ...(opts.tenant ? ['--tenant', opts.tenant] : [])] } } : {}) });
  });
  const modelBase = '/api/services/modelling/objects/:object';
  mutation(modelCommand, { command: 'update-object <object>', description: 'Update object labels or rename through the platform lifecycle gate', method: 'PATCH', endpoint: modelBase, schema: z.strictObject({ display_name: text.optional(), description: z.string().optional(), help_text: z.string().optional(), category: text.optional(), api_name: text.optional(), reratificationGateId: text.optional(), display_icon: text.optional(), display_color: text.optional() }).refine(v => Object.keys(v).some(k => k !== 'reratificationGateId'), 'Provide editable fields') });
  mutation(modelCommand, { command: 'update-field <object> <fieldId>', description: 'Update or rename a field; server lifecycle gates are preserved', method: 'PATCH', endpoint: modelBase + '/fields/:fieldId', schema: z.strictObject({ display_name: text.optional(), description: z.string().optional(), is_required: z.boolean().optional(), default_value: z.unknown().optional(), size: z.number().optional(), scale: z.number().optional(), ai_masking: text.optional(), semantic_type: text.optional(), display_order: z.number().int().optional(), relationship_type: text.optional(), on_delete: text.optional(), api_name: text.optional(), settings: object.optional(), reratificationGateId: text.optional() }).refine(v => Object.keys(v).some(k => k !== 'reratificationGateId'), 'Provide editable fields') });
  for (const target of ['object', 'field'] as const) {
    tenantOption(modelCommand.command(`retire-${target} <object>${target === 'field' ? ' <fieldId>' : ''}`).description('Soft-retire through platform lifecycle gates; backend may schedule a later purge'))
      .option('--gate <id>', 'Existing reratification gate ID, if required').action(async (...values: unknown[]) => {
        const opts = values.at(-2) as PayloadOptions & { gate?: string }; const args = values.slice(0, -2) as string[];
        const endpoint = `/api/services/modelling/objects/${pathPart(args[0])}${target === 'field' ? `/fields/${pathPart(args[1])}` : ''}${opts.gate ? '?' + new URLSearchParams({ reratificationGateId: opts.gate }) : ''}`;
        domainResult(await apiRequest({ method: 'DELETE', path: endpoint, tenant: opts.tenant }));
      });
  }
  mutation(modelCommand, { command: 'restore-field <object> <fieldId>', description: 'Restore a field within the platform retention window', method: 'POST', endpoint: modelBase + '/fields/:fieldId/restore' });
}
