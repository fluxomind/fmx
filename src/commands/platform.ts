import { z } from 'zod';
import { declareContract, parsedBody } from '../lib/command-contract';
import { getRecord } from '../lib/record-service';
import { createApp, appCreateSchema } from '../lib/app-create';
import { Command, InvalidArgumentError } from 'commander';
import { get, post } from '../lib/api-client';
import { fieldsOption, integer, objectPayload, pathPart, payloadOptions, tenantOption, type JsonRecord, type PayloadOptions } from '../lib/command-options';
import { print } from '../lib/output';
import { detail, mutationResult } from '../lib/platform-output';
import { projectRows } from './inspect';
function required(body: JsonRecord, keys: string[]): void {
  for (const key of keys) if (typeof body[key] !== 'string' || !(body[key] as string).trim()) throw new InvalidArgumentError(`Payload requires a nonempty ${key}`);
}
const text = z.string().trim().min(1);
const objectCreateSchema = z.strictObject({ name: text, api_name: text, display_name: text.optional(), description: z.string().optional() });
const fieldCreateSchema = z.strictObject({ apiName: text, displayName: text, dataType: text.optional(), isRequired: z.boolean().optional(), sortOrder: z.number().int().optional(), settings: z.record(z.string(), z.unknown()).nullable().optional(), description: z.string().optional(), defaultValue: z.unknown().optional(), maxLength: z.number().positive().optional(), scale: z.number().nonnegative().optional(), maskingType: text.optional(), semanticType: text.optional(), formulaExpression: text.optional(), formulaReturnType: text.optional(), parentObjectApiName: text.optional(), relationshipType: text.optional(), onDelete: text.optional() });
export const modelCommand = new Command('model').description('Model objects and fields through the platform modelling APIs');
const createObject = payloadOptions(modelCommand.command('create-object').description('Create an object; payload uses name, api_name, display_name, description'))
  .action(async (opts: PayloadOptions) => {
    const body = parsedBody(objectCreateSchema, objectPayload(opts));
    const unknown = Object.keys(body).filter(k => !['name', 'api_name', 'display_name', 'description'].includes(k));
    if (unknown.length) throw new InvalidArgumentError(`Unsupported object properties: ${unknown.join(', ')}`);
    const result = await post<JsonRecord>('/api/services/modelling/objects', body, opts.tenant);
    if (typeof result.objectId === 'string') {
      try {
        const row = await getRecord('fm__object', result.objectId, opts.tenant);
        if (typeof row.api_name !== 'string') throw new Error('Canonical API name unavailable');
        result.apiName = row.api_name;
      } catch (err) {
        result.identityState = 'unverified';
        result.identityError = (err as Error).message;
        result.help = 'Creation returned an objectId. Inspect that ID; do not repeat the create.';
      }
    }
    mutationResult(result);
  });
const createField = payloadOptions(modelCommand.command('create-field <object>').description('Create a field; payload uses apiName, displayName, dataType and field settings'))
  .action(async (object: string, opts: PayloadOptions) => {
    const body = parsedBody(fieldCreateSchema, objectPayload(opts));
    const keys = ['apiName', 'displayName', 'dataType', 'isRequired', 'sortOrder', 'settings', 'description', 'defaultValue', 'maxLength', 'scale', 'maskingType', 'semanticType', 'formulaExpression', 'formulaReturnType', 'parentObjectApiName', 'relationshipType', 'onDelete'];
    const unknown = Object.keys(body).filter(k => !keys.includes(k)); if (unknown.length) throw new InvalidArgumentError(`Unsupported field properties: ${unknown.join(', ')}`);
    if (body.dataType === 'RELATION') required(body, ['parentObjectApiName']);
    mutationResult(await post(`/api/services/modelling/objects/${pathPart(object)}/fields/create`, body, opts.tenant));
  });
declareContract(createObject, { method: 'POST', endpoint: '/api/services/modelling/objects', effects: ['write'], inputSchema: z.toJSONSchema(objectCreateSchema), serverAuthoritative: true, validation: 'Offline structure; platform validates authorization and semantics.' });
declareContract(createField, { method: 'POST', endpoint: '/api/services/modelling/objects/:object/fields/create', effects: ['write'], inputSchema: z.toJSONSchema(fieldCreateSchema), serverAuthoritative: true, validation: 'Offline structure; platform validates authorization and semantics.' });
export const appsCommand = new Command('apps').description('Discover tenant applications');
tenantOption(appsCommand.command('list').description('List visible applications with compact identity and status'))
  .option('--full', 'Include server summaries').action(async (opts: PayloadOptions) => {
    const result = await get<{ apps: { application: JsonRecord; summary: unknown }[] }>('/api/services/appEngine/apps', opts.tenant);
    const apps = opts.full ? result.apps : result.apps.map(({ application: a }) => ({ id: a.Id, name: a.Name, namespace: a.Namespace, status: a.Status }));
    print({ count: apps.length, total: apps.length, apps });
  });
export const connectionsCommand = new Command('connections').description('Inspect integration connections without returning credentials');
tenantOption(connectionsCommand.command('list').description('List integration identities and health; secret fields are never printed'))
  .action(async (opts: PayloadOptions) => {
    const result = await get<{ data: JsonRecord[] }>('/api/workflow-studio/connections', opts.tenant);
    print({ count: result.data.length, connections: projectRows(result.data, ['id', 'name', 'provider', 'health_status']).rows });
  });
export const jobsCommand = new Command('jobs').description('Inspect queue jobs; read-only operations');
tenantOption(jobsCommand.command('list').description('List jobs with lookahead; platform total is not an exact count'))
  .option('--status <status>', 'Filter by job status').option('--type <name>', 'Filter by job type')
  .option('--limit <count>', 'Page size', integer(1, 199), 50).option('--offset <count>', 'Offset', integer(0, Number.MAX_SAFE_INTEGER), 0)
  .option('--fields <csv>', 'Selected output fields')
  .action(async (opts: PayloadOptions & { status?: string; type?: string; limit: number; offset: number; fields?: string }) => {
    const fields = fieldsOption(opts.fields) ?? ['jobId', 'jobType', 'status', 'progress'];
    const params = new URLSearchParams({ limit: String(opts.limit + 1), offset: String(opts.offset) });
    if (opts.status) params.set('status', opts.status); if (opts.type) params.set('jobType', opts.type);
    const result = await get<{ data: { items: JsonRecord[] } }>(`/api/v1/queueEngine/jobs?${params}`, opts.tenant);
    const items = result.data.items; const hasMore = items.length > opts.limit;
    const args = ['jobs', 'list', '--offset', String(opts.offset + opts.limit), '--limit', String(opts.limit)];
    for (const [flag, value] of [['--tenant', opts.tenant], ['--status', opts.status], ['--type', opts.type], ['--fields', opts.fields]]) if (value) args.push(flag!, value);
    print({ count: Math.min(items.length, opts.limit), total: null, hasMore, jobs: projectRows(items.slice(0, opts.limit), fields).rows, ...(hasMore ? { next: { command: 'fmx', args } } : {}) });
  });
tenantOption(jobsCommand.command('get <id>').description('Read job status, diagnostics and execution details'))
  .option('--full', 'Complete text').action(async (id: string, opts: PayloadOptions) => detail(await get(`/api/v1/queueEngine/jobs/${pathPart(id)}`, opts.tenant), opts.full, `fmx jobs get ${id} --full`));

tenantOption(appsCommand.command('get <namespace>').description('Read the role-projected application manifest'))
  .option('--full', 'Complete manifest text').action(async (namespace: string, opts: PayloadOptions) => {
    const result = await get<JsonRecord>(`/api/services/appEngine/manifest?${new URLSearchParams({ namespace })}`, opts.tenant);
    if (result.status === 'error') { mutationResult({ ...result, success: false }); return; }
    detail(result, opts.full, `fmx apps get ${namespace} --full`);
  });
payloadOptions(connectionsCommand.command('create').description('Create a connection; use --file or stdin for credentials; secret fields never printed'))
  .action(async (opts: PayloadOptions) => {
    const body = objectPayload(opts); required(body, ['name', 'provider']);
    const unknown = Object.keys(body).filter(k => !['name', 'provider', 'credentialType', 'credentials', 'scopes'].includes(k));
    if (unknown.length) throw new InvalidArgumentError(`Unsupported connection properties: ${unknown.join(', ')}`);
    const result = await post<JsonRecord>('/api/workflow-studio/connections', body, opts.tenant);
    print({ connection: projectRows([result], ['id', 'name', 'provider', 'health_status']).rows[0] });
  });

payloadOptions(appsCommand.command('create').description('Create an app identity from JSON or instantiate a complete app from a published template'))
  .option('--template <id>', 'Instantiate the template through the governed platform service; mutually exclusive with JSON')
  .option('--dry-run', 'Show the request without executing it; offline by default')
  .option('--remote', 'With --dry-run, check namespace or template catalog using GET only')
  .action(async (opts: PayloadOptions & { template?: string; dryRun?: boolean; remote?: boolean }, command) => {
    const dryRun = Boolean(command.optsWithGlobals().dryRun);
    if (!opts.template) { mutationResult(await createApp(objectPayload(opts), { ...opts, dryRun })); return; }
    if (opts.data !== undefined || opts.file !== undefined) throw new InvalidArgumentError('--template cannot be combined with --data or --file');
    if (opts.remote && !dryRun) throw new InvalidArgumentError('--remote requires --dry-run');
    if (dryRun) {
      const result: JsonRecord = { dryRun: true, writesPerformed: false, scope: opts.remote ? 'template-read-only-preflight' : 'local-only', plan: { method: 'POST', path: '/api/services/app/templates', body: { templateId: opts.template } }, warning: 'Template instantiation is owned by the platform. This preview does not verify write permissions or all referenced resources.' };
      if (opts.remote) {
        const catalog = await get<{ data: JsonRecord[] }>('/api/services/app/templates', opts.tenant);
        const selected = catalog.data.find(t => t.id === opts.template);
        result.template = selected ? projectRows([selected], ['id', 'displayName', 'category']).rows[0] : null;
        result.availability = selected ? 'listed' : 'not-listed';
        result.catalogLimit = 200;
      }
      print(result); return;
    }
    mutationResult(await post('/api/services/app/templates', { templateId: opts.template }, opts.tenant));
  });
tenantOption(appsCommand.command('templates').description('List published templates available for complete app creation'))
  .option('--category <name>', 'Category filter').option('--full', 'Complete template metadata')
  .action(async (opts: PayloadOptions & { category?: string }) => {
    const path = '/api/services/app/templates' + (opts.category ? `?${new URLSearchParams({ category: opts.category })}` : '');
    const result = await get<{ data: JsonRecord[] }>(path, opts.tenant);
    if (opts.full) detail(result, true, 'fmx apps templates --full');
    else print({ count: result.data.length, total: null, sourceLimit: 200, templates: projectRows(result.data, ['id', 'displayName', 'category']).rows, help: 'fmx apps create --template <template-id> --dry-run' });
  });
appsCommand.command('schema').description('Offline JSON Schema for apps create input')
  .action(() => print({ scope: 'application-record-only', schema: z.toJSONSchema(appCreateSchema), help: 'fmx apps create --file <app.json> --dry-run' }));
