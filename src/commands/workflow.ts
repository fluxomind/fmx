import { Command, InvalidArgumentError } from 'commander';
import { apiRequest, get, post } from '../lib/api-client';
import { objectOption, objectPayload, pathPart, payloadOptions, tenantOption, listOptions, type JsonRecord, type ListOptions, type PayloadOptions } from '../lib/command-options';
import { detail, mutationResult } from '../lib/platform-output';
import { listRecords } from '../lib/record-service';
import { pageResult } from './records';
import { print } from '../lib/output';
import { projectRows } from './inspect';
const definitions = '/api/workflow/definitions';
export const workflowCommand = new Command('workflow').description('Workflow definitions, action schemas, publishing and execution');
listOptions(workflowCommand.command('list').description('List workflow definitions; filters and pagination run on the server'))
  .action(async (opts: ListOptions) => pageResult('fm__workflow_definition', await listRecords('fm__workflow_definition', opts, ['id', 'name', 'status', 'version']), opts));
tenantOption(workflowCommand.command('get <id>').description('Read a workflow definition'))
  .option('--full', 'Complete definition text').action(async (id: string, opts: PayloadOptions) => detail(await get(`${definitions}/${pathPart(id)}`, opts.tenant), opts.full, `fmx workflow get ${id} --full`));
payloadOptions(workflowCommand.command('create').description('Create a draft; payload requires name and type'))
  .action(async (opts: PayloadOptions) => {
    const body = objectPayload(opts);
    if (typeof body.name !== 'string' || !body.name.trim() || typeof body.type !== 'string' || !body.type.trim()) throw new InvalidArgumentError('Workflow creation requires nonempty name and type in the payload');
    mutationResult(await post(definitions, body, opts.tenant));
  });
payloadOptions(workflowCommand.command('update <id>').description('Save changes to a draft workflow definition'))
  .action(async (id: string, opts: PayloadOptions) => mutationResult(await apiRequest({ method: 'PUT', path: `${definitions}/${pathPart(id)}`, body: objectPayload(opts), tenant: opts.tenant })));
tenantOption(workflowCommand.command('delete <id>').description('Delete the workflow definition'))
  .action(async (id: string, opts: PayloadOptions) => mutationResult(await apiRequest({ method: 'DELETE', path: `${definitions}/${pathPart(id)}`, tenant: opts.tenant })));
tenantOption(workflowCommand.command('publish <id>').description('Publish and freeze an immutable definition version'))
  .action(async (id: string, opts: PayloadOptions) => mutationResult(await post(`${definitions}/${pathPart(id)}/versions`, { action: 'publish' }, opts.tenant)));
tenantOption(workflowCommand.command('rollback <id> <versionId>').description('Restore an immutable version as a new version'))
  .action(async (id: string, versionId: string, opts: PayloadOptions) => mutationResult(await post(`${definitions}/${pathPart(id)}/versions`, { action: 'rollback', targetVersionId: versionId }, opts.tenant)));
tenantOption(workflowCommand.command('run <id>').description('Validate the action contract and start a workflow run'))
  .option('--trigger <json>', 'Trigger payload as JSON object')
  .action(async (id: string, opts: PayloadOptions & { trigger?: string }) => {
    const triggerPayload = objectOption(opts.trigger, '--trigger') ?? {};
    mutationResult(await post(`${definitions}/${pathPart(id)}/execute`, { triggerPayload }, opts.tenant));
  });
for (const name of ['versions', 'lifecycle'] as const) {
  tenantOption(workflowCommand.command(`${name} <id>`).description(name === 'versions' ? 'Read immutable version history' : 'Read lifecycle and recent instances'))
    .option('--full', 'Complete text').action(async (id: string, opts: PayloadOptions) => detail(await get(`${definitions}/${pathPart(id)}/${name}`, opts.tenant), opts.full, `fmx workflow ${name} ${id} --full`));
}
listOptions(workflowCommand.command('runs').description('List workflow runs from the tenant'))
  .action(async (opts: ListOptions) => pageResult('fm__workflow_run', await listRecords('fm__workflow_run', opts, ['id', 'definition_id', 'status', 'created_at']), opts));
tenantOption(workflowCommand.command('events <runId>').description('Read the server-redacted run timeline'))
  .option('--full', 'Complete event text').action(async (id: string, opts: PayloadOptions) => detail(await get(`/api/workflow/runs/${pathPart(id)}/events`, opts.tenant), opts.full, `fmx workflow events ${id} --full`));
tenantOption(workflowCommand.command('cancel <runId>').description('Cancel a workflow run'))
  .option('--reason <reason>', 'Reason for cancellation').action(async (id: string, opts: PayloadOptions & { reason?: string }) => mutationResult(await post(`/api/v1/workflow/${pathPart(id)}/cancel`, opts.reason ? { reason: opts.reason } : {}, opts.tenant)));
tenantOption(workflowCommand.command('templates').description('List available workflow templates'))
  .action(async (opts: PayloadOptions) => {
    const response = await get<{ templates: JsonRecord[] }>('/api/v1/workflow/definitions/templates', opts.tenant);
    const rows = projectRows(response.templates, ['id', 'name', 'type', 'status']).rows;
    print({ count: rows.length, total: null, templates: rows, help: 'fmx workflow clone <template-id>' });
  });
tenantOption(workflowCommand.command('clone <templateId>').description('Clone a template into a new draft'))
  .action(async (id: string, opts: PayloadOptions) => mutationResult(await post(`/api/v1/workflow/definitions/${pathPart(id)}/clone`, {}, opts.tenant)));
const actions = workflowCommand.command('actions').description('Discover executable workflow actions and their input schemas');
tenantOption(actions.command('list').description('Read the action catalog'))
  .option('--full', 'Include all action metadata').action(async (opts: PayloadOptions) => {
    const response = await get<{ actions: JsonRecord[] }>('/api/workflow/catalog', opts.tenant);
    const unique = [...new Map(response.actions.map(action => [String(action.name), action])).values()];
    const rows = projectRows(unique, opts.full ? undefined : ['name', 'label', 'category'], opts.full).rows;
    print({ count: rows.length, actions: rows, help: 'fmx workflow actions schema <action-name>' });
  });
tenantOption(actions.command('schema <name>').description('Read an action input/output schema'))
  .action(async (name: string, opts: PayloadOptions) => print(await get(`/api/workflow/catalog/${pathPart(name)}/schema`, opts.tenant)));
workflowCommand.addHelpText('after', '\nExamples:\n  fmx workflow actions list\n  fmx workflow create --file draft.json\n  fmx workflow run <id> --trigger \'{"source":"manual"}\'');
