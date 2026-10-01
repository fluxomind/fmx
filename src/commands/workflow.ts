import { Command, InvalidArgumentError } from 'commander';
import { apiRequest, get, post, ServerError } from '../lib/api-client';
import { integer, objectOption, objectPayload, pathPart, payloadOptions, tenantOption, listOptions, type JsonRecord, type ListOptions, type PayloadOptions } from '../lib/command-options';
import { compact, detail, mutationResult } from '../lib/platform-output';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { definitionSchema, validateWorkflow, validateActionContracts, unwrapDefinition } from '../lib/workflow-validation';
import { runId, waitForRun } from '../lib/workflow-runs';
import { getRecord, listRecords } from '../lib/record-service';
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
  .option('--full', 'Print the entire saved definition')
  .action(async (opts: PayloadOptions) => {
    const body = objectPayload(opts);
    if (typeof body.name !== 'string' || !body.name.trim() || typeof body.type !== 'string' || !body.type.trim()) throw new InvalidArgumentError('Workflow creation requires nonempty name and type in the payload');
    const saved = await post<JsonRecord>(definitions, body, opts.tenant);
    if (saved.success === false || opts.full) mutationResult(saved); else print({ id: saved.id, name: saved.name, status: saved.status, version: saved.version, help: `fmx workflow get ${saved.id} --full` });
  });
payloadOptions(workflowCommand.command('update <id>').description('Save changes to a draft workflow definition'))
  .action(async (id: string, opts: PayloadOptions) => mutationResult(await apiRequest({ method: 'PUT', path: `${definitions}/${pathPart(id)}`, body: objectPayload(opts), tenant: opts.tenant })));
tenantOption(workflowCommand.command('delete <id>').description('Delete the workflow definition'))
  .action(async (id: string, opts: PayloadOptions) => {
    try { mutationResult(await apiRequest({ method: 'DELETE', path: `${definitions}/${pathPart(id)}`, tenant: opts.tenant })); }
    catch (err) { if (err instanceof ServerError && err.statusCode === 404) print({ ok: true, id, noop: true, message: 'Workflow is already absent' }); else throw err; }
  });
tenantOption(workflowCommand.command('publish <id>').description('Publish and freeze an immutable definition version'))
  .action(async (id: string, opts: PayloadOptions) => mutationResult(await post(`${definitions}/${pathPart(id)}/versions`, { action: 'publish' }, opts.tenant)));
tenantOption(workflowCommand.command('rollback <id> <versionId>').description('Restore an immutable version as a new version'))
  .action(async (id: string, versionId: string, opts: PayloadOptions) => mutationResult(await post(`${definitions}/${pathPart(id)}/versions`, { action: 'rollback', targetVersionId: versionId }, opts.tenant)));
tenantOption(workflowCommand.command('run <id>').description('Start a workflow; optionally wait until terminal or waiting'))
  .option('--trigger <json>', 'Trigger payload as JSON object')
  .option('--wait', 'Wait for terminal status or a suspended run')
  .option('--full', 'Do not truncate run text')
  .option('--timeout <ms>', 'Wait timeout; does not cancel the run', integer(1, 3600000), 60000)
  .option('--interval <ms>', 'Polling interval', integer(10, 60000), 1000)
  .action(async (id: string, opts: PayloadOptions & { trigger?: string; wait?: boolean; timeout: number; interval: number }) => {
    const triggerPayload = objectOption(opts.trigger, '--trigger') ?? {};
    const started = await post<JsonRecord>(`${definitions}/${pathPart(id)}/execute`, { triggerPayload }, opts.tenant);
    if (started.success === false) { mutationResult(started); return; }
    if (!opts.wait) { mutationResult(started); return; }
    const run = runId(started);
    if (!run) { print({ ...started, code: 'RUN_ID_MISSING', error: 'Platform response did not include a run ID. Inspect workflow runs before retrying.' }); process.exitCode = 1; return; }
    let result: JsonRecord;
    try { result = await waitForRun(run, opts.tenant, opts.timeout, opts.interval); }
    catch (err) {
      print({ workflowRunId: run, outcome: 'observation_failed', code: 'RUN_OBSERVATION_FAILED', error: (err as Error).message, help: `fmx workflow runs get ${run}`, continuesOnServer: true });
      process.exitCode = 1; return;
    }
    const rendered = compact(result, opts.full);
    print({ ...(rendered.data as JsonRecord), ...(rendered.truncated ? { truncated: true, help: `fmx workflow runs get ${run} --full` } : {}) });
    if (result.outcome === 'timeout' || ['failed', 'cancelled'].includes(String((result.run as JsonRecord | undefined)?.status))) process.exitCode = 1;
  });
for (const name of ['versions', 'lifecycle'] as const) {
  tenantOption(workflowCommand.command(`${name} <id>`).description(name === 'versions' ? 'Read immutable version history' : 'Read lifecycle and recent instances'))
    .option('--full', 'Complete text').action(async (id: string, opts: PayloadOptions) => detail(await get(`${definitions}/${pathPart(id)}/${name}`, opts.tenant), opts.full, `fmx workflow ${name} ${id} --full`));
}
const runs = listOptions(workflowCommand.command('runs').description('List workflow runs, or use runs get <runId>'))
  .action(async (opts: ListOptions) => pageResult('fm__workflow_run', await listRecords('fm__workflow_run', opts, ['id', 'workflow_definition_id', 'status', 'created_at']), opts));
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

tenantOption(runs.command('get <runId>').description('Read the current status, variables and resolution of a run'))
  .option('--full', 'Complete text').action(async (id: string, opts: PayloadOptions, command) => detail(await getRecord('fm__workflow_run', id, command.optsWithGlobals().tenant), opts.full, `fmx workflow runs get ${id} --full`));
payloadOptions(workflowCommand.command('validate').description('Validate local structure offline; --remote also reads action input contracts'))
  .option('--remote', 'Read action schemas from the selected tenant; never executes or writes')
  .action(async (opts: PayloadOptions & { remote?: boolean }) => {
    const body = objectPayload(opts); const result = validateWorkflow(body);
    if (result.valid && opts.remote) {
      result.errors.push(...await validateActionContracts(body, opts.tenant)); result.valid = result.errors.length === 0; result.scope = 'local-structure-and-remote-action-inputs';
    }
    print(result); if (!result.valid) process.exitCode = 2;
  });
tenantOption(workflowCommand.command('export <id>').description('Export the canonical definition as a reusable create payload'))
  .requiredOption('--out <path>', 'Lossless JSON; refuses to overwrite a file')
  .action(async (id: string, opts: PayloadOptions & { out: string }) => {
    const remote = await get<JsonRecord>(`${definitions}/${pathPart(id)}`, opts.tenant);
    const payload = { name: remote.name, type: remote.type, ...(remote.workflow_kind ? { workflow_kind: remote.workflow_kind } : {}), definition: remote.definition };
    writeFileSync(opts.out, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); print({ ok: true, path: resolve(opts.out), scope: 'definition-only' });
  });
tenantOption(workflowCommand.command('diff <id>').description('Compare local and remote definitions; read-only, ignores definition id/version'))
  .requiredOption('--file <path>', 'Local canonical definition or create payload')
  .action(async (id: string, opts: PayloadOptions & { file: string }) => {
    const local = objectPayload({ file: opts.file });
    const validation = validateWorkflow(local); if (!validation.valid) { print(validation); process.exitCode = 2; return; }
    const remote = await get<JsonRecord>(`${definitions}/${pathPart(id)}`, opts.tenant);
    const left = unwrapDefinition(remote) as JsonRecord; const right = unwrapDefinition(local) as JsonRecord;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(k => !['id', 'version'].includes(k));
    const changed = keys.filter(k => !isDeepStrictEqual(left[k], right[k]));
    print({ id, equal: changed.length === 0, changed, ignoredFields: ['id', 'version'], help: changed.length ? `fmx workflow get ${id} --full` : undefined });
  });

workflowCommand.command('schema').description('Print the offline canonical definition JSON Schema; no HTTP calls')
  .action(() => print({ scope: 'structure-only', schema: z.toJSONSchema(definitionSchema), help: 'fmx workflow validate --file <workflow.json>' }));
