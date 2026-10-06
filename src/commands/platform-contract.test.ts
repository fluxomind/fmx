import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const fixture = { id: 'demo', name: 'Demo', type: 'custom', version: 1, triggers: [], nodes: [{ id: 'code', type: 'custom_code', config: { code: 'return {};' } }], edges: [] };
const execute = promisify(execFile);
interface Captured { method?: string; path: string; headers: Record<string, unknown>; body?: any }
let server: Server; let origin: string; let calls: Captured[] = []; let status = 200; let response: unknown; let sequence: unknown[] = []; let scripted: { status: number; response: unknown }[] = [];
const root = mkdtempSync(join(tmpdir(), 'fmx-contract-'));
async function run(...args: string[]) {
  try {
    const result = await execute(process.execPath, [resolve('dist/bin.js'), '--format', 'json', ...args], { env: { ...process.env, FLUXOMIND_API_URL: origin, FLUXOMIND_ACCESS_TOKEN: 'fixture-token', FLUXOMIND_DISABLE_METRICS: '1' } });
    return { code: 0, ...result, data: JSON.parse(result.stdout) };
  } catch (err) {
    const failure = err as { code: number; stdout: string; stderr: string };
    return { ...failure, data: JSON.parse(failure.stdout) };
  }
}
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    calls.push({ method: req.method, path: req.url!, headers: req.headers, body: text ? JSON.parse(text) : undefined });
    if (req.url === '/api/v1/session-check') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ tokenUser: { tenantId: 'tenant', userId: 'user' } })); return; }
    const step = scripted.shift();
    res.writeHead(step?.status ?? status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(step ? step.response : sequence.length ? sequence.shift() : response));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); });
beforeEach(() => { calls = []; status = 200; sequence = []; scripted = []; response = { success: true }; });
describe('Platform CLI over HTTP (route contracts)', () => {
  it('uses token-env auth, lookahead, server fields and filters without inventing totals', async () => {
    response = { success: true, data: [{ id: '1', name: 'first' }, { id: '2', name: 'next' }], totalRecords: 2, rowLimit: { exact: false, applied: 2 } };
    const result = await run('records', 'list', 'fm__demo', '--limit', '1', '--fields', 'id,name', '--filters', '{"name":"first"}');
    expect(result.code).toBe(0); expect(result.data).toMatchObject({ count: 1, total: null, hasMore: true, records: [{ id: '1', name: 'first' }] });
    const url = new URL(calls[0].path, origin); expect(url.searchParams.get('limit')).toBe('2');
    expect(JSON.parse(url.searchParams.get('selectFields')!)).toEqual(['id', 'name']);
    expect(JSON.parse(url.searchParams.get('filters')!)).toEqual({ name: 'first' });
    expect(calls[0].headers.authorization).toBe('Bearer fixture-token'); expect(result.stdout).not.toContain('fixture-token');
  });
  it('preserves exact server totals and explicit empty states', async () => {
    response = { success: true, data: [], totalRecords: 0, rowLimit: { exact: true, applied: 101 } };
    const result = await run('records', 'list', 'fm__demo'); expect(result.data).toMatchObject({ count: 0, total: 0, hasMore: false, records: [] });
  });
  it('creates a record from a file with the exact payload envelope', async () => {
    const file = join(root, 'create.json'); writeFileSync(file, '{"name":"demo","enabled":false}'); response = { id: 'record', name: 'demo' };
    expect((await run('records', 'create', 'fm__demo', '--file', file)).code).toBe(0);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/dataEngine?entityApiParam=fm__demo', body: { payload: { name: 'demo', enabled: false } } });
  });
  it('preserves conditional baselines and returns conflict details with exit 1', async () => {
    status = 409; response = { message: 'Baseline changed', error: { code: 'DATAENGINE_CONDITIONAL_WRITE_CONFLICT' }, conflict: { mismatches: [{ field: 'status', expected: 'draft' }] } };
    const result = await run('records', 'update', 'fm__demo', 'one', '--data', '{"status":"active"}', '--expected', '{"status":"draft"}');
    expect(result.code).toBe(1); expect(result.data).toMatchObject({ status: 409, code: 'DATAENGINE_CONDITIONAL_WRITE_CONFLICT', details: { mismatches: [{ field: 'status', expected: 'draft' }] } });
    expect(calls).toHaveLength(1); expect(calls[0].body).toEqual({ id: 'one', payload: { status: 'active' }, expectedValues: { status: 'draft' } });
  });
  it('deletes only the selected record and accepts a successful response', async () => {
    expect((await run('records', 'delete', 'fm__demo', 'id/with space')).code).toBe(0);
    const url = new URL(calls[0].path, origin); expect(calls[0].method).toBe('DELETE'); expect(url.searchParams.get('id')).toBe('id/with space');
  });
  it('preserves partial batch results with a nonzero exit', async () => {
    status = 207; response = { success: false, totalProcessed: 2, totalFailed: 1, results: [{ id: 'one', success: true }, { success: false, error: 'invalid' }] };
    const result = await run('records', 'batch', 'update', 'fm__demo', '--data', '[{"id":"one","data":{"name":"new"}}]', '--continue-on-error');
    expect(result.code).toBe(1); expect(result.data).toEqual(response); expect(calls[0].body).toEqual({ entity: 'fm__demo', records: [{ id: 'one', data: { name: 'new' } }], stopOnError: false });
  });
  it('refuses unsupported conditional batch updates before network access', async () => {
    const result = await run('records', 'batch', 'update', 'fm__demo', '--data', '[{"id":"one","data":{},"expectedValues":{}}]');
    expect(result.code).toBe(2); expect(result.data.error).toContain('expectedValues'); expect(calls).toHaveLength(0);
  });
  it('publishes an immutable workflow version through the version endpoint', async () => {
    response = { version: 'v2', versionId: 'snapshot' };
    expect((await run('workflow', 'publish', 'definition')).data).toEqual(response);
    expect(calls[0]).toMatchObject({ path: '/api/workflow/definitions/definition/versions', method: 'POST', body: { action: 'publish' } });
  });
  it('starts a workflow with its validated trigger payload', async () => {
    response = { workflowRunId: 'run', status: 'started' };
    expect((await run('workflow', 'run', 'definition', '--trigger', '{"source":"cli"}')).code).toBe(0);
    expect(calls[0]).toMatchObject({ path: '/api/workflow/definitions/definition/execute', body: { triggerPayload: { source: 'cli' } } });
  });
  it('exports lossless agent config and imports that file using the platform contract', async () => {
    response = { version: '1.0', agent: { name: 'Demo', system_prompt: 'a'.repeat(2500) }, knowledge: [] };
    const file = join(root, 'agent.json');
    expect((await run('agent', 'export', 'agent-id', '--out', file)).code).toBe(0);
    const contents = JSON.parse(readFileSync(file, 'utf8')); expect(contents).toEqual(response);
    expect(calls[0].body).toEqual({ agentId: 'agent-id' });
    expect((await run('agent', 'import', '--file', file, '--mode', 'create', '--name', 'Clone')).code).toBe(0);
    expect(calls[1]).toMatchObject({ path: '/api/v1/agentConfig/import', body: { data: contents, options: { mode: 'create', newAgentName: 'Clone' } } });
  });
  it('rejects arbitrary URLs and invalid JSON before sending credentials', async () => {
    expect((await run('api', 'GET', 'https://example.test/api/data')).code).toBe(2);
    expect((await run('records', 'create', 'fm__demo', '--data', 'broken')).code).toBe(2);
    expect(calls).toHaveLength(0);
  });
  it('does not repeat a mutation on 503', async () => {
    status = 503; response = { error: { code: 'UNAVAILABLE', message: 'Try later' } };
    const result = await run('agent', 'create', '--data', '{"name":"Demo"}');
    expect(result.code).toBe(1); expect(result.data).toMatchObject({ code: 'UNAVAILABLE', status: 503 }); expect(calls).toHaveLength(1);
  });
  it('reports a legacy aggregate application error even when HTTP is 200', async () => {
    response = { value: null, error: 'AGGREGATE_TIMEOUT', executionTimeMs: 100 };
    const result = await run('records', 'aggregate', 'fm__demo', 'COUNT', 'id');
    expect(result.code).toBe(1); expect(result.data).toEqual(response);
    expect(calls[0].body).toEqual({ entityApiName: 'fm__demo', field: 'id', operation: 'COUNT' });
  });

  it('validates and discovers commands offline without any HTTP requests', async () => {
    const file = join(root, 'workflow.json'); writeFileSync(file, JSON.stringify(fixture));
    expect((await run('workflow', 'validate', '--file', file)).data).toMatchObject({ valid: true, scope: 'local-structure' });
    const catalog = await run('catalog', 'workflow', 'run');
    expect(catalog.data.command.options.some((o: any) => o.flags === '--wait')).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it('uses the production workflow definition field when listing runs', async () => {
    response = { success: true, data: [], rowLimit: { exact: true } };
    await run('workflow', 'runs');
    expect(JSON.parse(new URL(calls[0].path, origin).searchParams.get('selectFields')!)).toContain('workflow_definition_id');
  });
  it('waits for the created run without repeating execution', async () => {
    sequence = [{ workflowRunId: 'run-1', status: 'started' }, { id: 'run-1', status: 'active' }, { id: 'run-1', status: 'resolved', resolution: { message: 'done' } }];
    const result = await run('workflow', 'run', 'definition', '--wait', '--interval', '10');
    expect(result.code).toBe(0); expect(result.data).toMatchObject({ outcome: 'completed', run: { status: 'resolved' } });
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
    expect(new URL(calls[1].path, origin).searchParams.get('id')).toBe('run-1');
  });
  it('returns a suspended run without treating human review as completion', async () => {
    sequence = [{ workflowRunId: 'run-1' }, { id: 'run-1', status: 'waiting', current_step_id: 'review' }];
    const result = await run('workflow', 'run', 'definition', '--wait');
    expect(result.code).toBe(0); expect(result.data.outcome).toBe('waiting');
  });
  it('does not poll when the platform refuses execution with HTTP 200', async () => {
    response = { success: false, error: 'Execution refused', workflowRunId: 'run-1' };
    const result = await run('workflow', 'run', 'definition', '--wait');
    expect(result.code).toBe(1); expect(result.data).toEqual(response);
    expect(calls).toHaveLength(1);
  });
  it('preserves the run ID when a read returns an application-level error', async () => {
    sequence = [{ workflowRunId: 'run-1' }, { success: false, error: 'Read refused' }];
    const result = await run('workflow', 'run', 'definition', '--wait');
    expect(result.code).toBe(1);
    expect(result.data).toMatchObject({ workflowRunId: 'run-1', outcome: 'observation_failed', error: 'Read refused', continuesOnServer: true });
    expect(calls).toHaveLength(2);
  });
  it('reports failed execution with exit 1 and preserves its run ID', async () => {
    sequence = [{ workflowRunId: 'run-1' }, { id: 'run-1', status: 'failed', current_step_id: 'code' }];
    const result = await run('workflow', 'run', 'definition', '--wait');
    expect(result.code).toBe(1); expect(result.data.workflowRunId).toBe('run-1');
  });
  it('bounds polling and does not cancel or restart on timeout', async () => {
    sequence = [{ workflowRunId: 'run-1' }]; response = { id: 'run-1', status: 'active' };
    const result = await run('workflow', 'run', 'definition', '--wait', '--timeout', '80', '--interval', '10');
    expect(result.code).toBe(1); expect(result.data).toMatchObject({ outcome: 'timeout', continuesOnServer: true });
    expect(calls.filter(c => c.method !== 'GET')).toHaveLength(1);
  });
  it('explains ambiguous queue errors without repeating the mutation', async () => {
    status = 500; response = { error: 'Fila saturada para workflow-execution: queue_age_exceeded' };
    const result = await run('workflow', 'run', 'definition');
    expect(result.data).toMatchObject({ code: 'WORKFLOW_QUEUE_SATURATED', operationState: 'unknown', retryable: false });
    expect(result.data.help).toContain('workflow runs'); expect(calls).toHaveLength(1);
  });
  it('preserves dependency errors without deleting versions automatically', async () => {
    status = 500; response = { error: '1 records in fm__workflow_definition_version reference this record via workflow_definition_id' };
    const result = await run('workflow', 'delete', 'definition');
    expect(result.data.code).toBe('DEPENDENT_RECORDS_EXIST'); expect(calls).toHaveLength(1);
  });
  it('exports a reusable definition without truncation and compares it read-only', async () => {
    response = { id: 'remote', name: 'Demo', type: 'custom', definition: { ...fixture, id: 'remote', version: 3 } };
    const file = join(root, 'exported-workflow.json');
    expect((await run('workflow', 'export', 'remote', '--out', file)).code).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).definition).toEqual((response as any).definition);
    const local = join(root, 'local-workflow.json'); writeFileSync(local, JSON.stringify(fixture));
    expect((await run('workflow', 'diff', 'remote', '--file', local)).data.equal).toBe(true);
    expect(calls.every(c => c.method === 'GET')).toBe(true);
  });

  it('reads action contracts only when explicitly requested', async () => {
    const file = join(root, 'action-workflow.json');
    writeFileSync(file, JSON.stringify({ ...fixture, nodes: [{ id: 'find', type: 'action', action: 'data.findRecords', config: {} }] }));
    response = { inputs: { object_api_name: { required: true } } };
    const result = await run('workflow', 'validate', '--file', file, '--remote');
    expect(result.code).toBe(2); expect(result.data.errors[0].message).toContain('object_api_name');
    expect(calls).toHaveLength(1); expect(calls[0].method).toBe('GET');
  });
  it('preserves modelling contracts and rejects misspelled input properties before writing', async () => {
    response = { objectId: 'new-object' };
    expect((await run('model', 'create-object', '--data', '{"name":"Demo","api_name":"demo__item"}')).code).toBe(0);
    expect(calls[0]).toMatchObject({ path: '/api/services/modelling/objects', method: 'POST', body: { name: 'Demo', api_name: 'demo__item' } });
    expect((await run('model', 'create-object', '--data', '{"name":"Demo","api_name":"demo__item","descriptin":"typo"}')).code).toBe(2);
    expect(calls).toHaveLength(2); expect(calls[1].method).toBe('GET');
    expect((await run('model', 'create-field', 'demo__item', '--data', '{"apiName":"title","displayName":"Title","isRequired":false}')).code).toBe(0);
    expect(calls[2].path).toBe('/api/services/modelling/objects/demo__item/fields/create');
  });
  it('omits secret fields in integration discovery even if the server returns them', async () => {
    response = { data: [{ id: 'connection', name: 'Demo', provider: 'demo', health_status: 'healthy', secret_encrypted: 'must-not-print', credentials: { token: 'must-not-print' } }] };
    const result = await run('connections', 'list'); expect(result.stdout).not.toContain('must-not-print');
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/workflow-studio/connections' });
  });
  it('projects the app catalog and keeps queue totals unknown', async () => {
    response = { apps: [{ application: { Id: 'app', Name: 'Demo', Namespace: 'demo', Status: 'active' }, summary: {} }] };
    expect((await run('apps', 'list')).data.apps).toEqual([{ id: 'app', name: 'Demo', namespace: 'demo', status: 'active' }]);
    response = { data: { items: [{ jobId: 'one', status: 'running' }, { jobId: 'two', status: 'pending' }], total: 2 } };
    const result = await run('jobs', 'list', '--limit', '1', '--type', 'workflow-execution');
    expect(result.data).toMatchObject({ count: 1, total: null, hasMore: true });
    expect(result.data.next.args).toContain('workflow-execution');
  });

  it('reads agent slots and links knowledge with dedicated API contracts', async () => {
    response = { assignments: [], profileAssignments: [], slots: [{ key: 'MAIN', label: 'Principal', role: 'COMPLETION' }], availableModels: [] };
    expect((await run('agent', 'models', 'list', 'agent')).data.slots[0].key).toBe('MAIN');
    response = { success: true };
    expect((await run('agent', 'models', 'assign', 'agent', '--data', '{"assignment":{"modelCatalogId":"model","role":"COMPLETION"}}')).code).toBe(0);
    expect(calls[1]).toMatchObject({ method: 'PUT', path: '/api/agent-studio/agents/agent/models', body: { assignment: { modelCatalogId: 'model', role: 'COMPLETION' } } });
    expect((await run('agent', 'knowledge', 'link', 'agent', '--data', '{"knowledgeIds":["kb"]}')).code).toBe(0);
    expect(calls[2]).toMatchObject({ method: 'POST', path: '/api/agent-studio/agents/agent/knowledge', body: { knowledgeIds: ['kb'] } });
  });
  it('does not claim success for an app manifest error returned with HTTP 200', async () => {
    response = { status: 'error', error: 'Application not found' };
    expect((await run('apps', 'get', 'demo')).code).toBe(1);
  });
  it('does not print connection credentials after creation', async () => {
    response = { id: 'connection', name: 'Demo', provider: 'demo', secret_encrypted: 'secret-fixture' };
    const result = await run('connections', 'create', '--data', '{"name":"Demo","provider":"demo","credentials":{"token":"secret-fixture"}}');
    expect(result.code).toBe(0); expect(result.stdout).not.toContain('secret-fixture');
    expect(calls[0].body.credentials.token).toBe('secret-fixture');
  });
  it('performs no HTTP calls for diagnostics without explicit remote opt-in', async () => {
    expect((await run('doctor')).data.scope).toBe('local-only');
    expect((await run('doctor', '--object', 'fm__demo')).code).toBe(2);
    expect(calls).toHaveLength(0);
    response = { status: 'ok' };
    expect((await run('doctor', '--remote')).data.ok).toBe(true);
    expect(calls[1]).toMatchObject({ method: 'GET', path: '/api/health' });
  });

  it('previews application creation offline without HTTP or execution', async () => {
    const result = await run('apps', 'create', '--data', '{"name":"Demo","namespace":"demo-app","colorTheme":"blue"}', '--dry-run');
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({ dryRun: true, writesPerformed: false, scope: 'local-only', plan: { method: 'POST', body: { payload: { name: 'Demo', namespace: 'demo-app', status: 'draft', color_theme: 'blue' } } } });
    expect(calls).toHaveLength(0);
    expect((await run('apps', 'create', '--data', '{"name":"Demo","namespace":"demo-app","tenant_id":"spoof"}', '--dry-run')).code).toBe(2);
    expect(calls).toHaveLength(0);
  });
  it('checks existing app identity in remote dry-run without any writes', async () => {
    response = { success: true, data: [{ id: 'existing', name: 'Demo', namespace: 'demo-app', status: 'draft' }] };
    const result = await run('apps', 'create', '--data', '{"name":"Demo","namespace":"demo-app"}', '--dry-run', '--remote');
    expect(result.data).toMatchObject({ plannedAction: 'noop', writesPerformed: false, existing: { id: 'existing' } });
    expect(calls).toHaveLength(1); expect(calls[0].method).toBe('GET');
    expect(JSON.parse(new URL(calls[0].path, origin).searchParams.get('filters')!)).toEqual({ namespace: { operator: 'eq', value: 'demo-app' } });
  });
  it('creates only the app identity through DataEngine after namespace lookup', async () => {
    sequence = [{ success: true, data: [] }, { id: 'created', name: 'Demo', namespace: 'demo-app', status: 'draft' }];
    const result = await run('apps', 'create', '--data', '{"name":"Demo","namespace":"demo-app"}');
    expect(result.code).toBe(0); expect(result.data.application.id).toBe('created');
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/api/v1/dataEngine?entityApiParam=fm__application', body: { payload: { name: 'Demo', namespace: 'demo-app', status: 'draft' } } });
    expect(calls).toHaveLength(2);
  });
  it('returns an existing application without changing its name or status', async () => {
    response = { success: true, data: [{ id: 'existing', name: 'Old name', namespace: 'demo-app', status: 'published' }] };
    const result = await run('apps', 'create', '--data', '{"name":"New name","namespace":"demo-app"}');
    expect(result.data).toMatchObject({ alreadyExists: true, unchanged: true, application: { name: 'Old name' } });
    expect(calls).toHaveLength(1); expect(calls[0].method).toBe('GET');
  });

  it('keeps a created run ID when observing the run fails', async () => {
    scripted = [{ status: 200, response: { workflowRunId: 'created-run' } }, { status: 403, response: { error: 'Forbidden' } }];
    const result = await run('workflow', 'run', 'definition', '--wait');
    expect(result.code).toBe(1); expect(result.data).toMatchObject({ workflowRunId: 'created-run', outcome: 'observation_failed', continuesOnServer: true });
    expect(calls).toHaveLength(2); expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
  });

  it('guards workflow execution globally in dry-run before authentication and HTTP', async () => {
    const result = await run('--dry-run', 'workflow', 'run', 'definition', '--wait');
    expect(result.code).toBe(0); expect(result.data).toMatchObject({ dryRun: true, writesPerformed: false, request: { method: 'POST', path: '/api/workflow/definitions/definition/execute' } });
    expect(calls).toHaveLength(0);
  });
  it('redacts credential values from generic dry-run previews', async () => {
    const result = await run('--dry-run', 'connections', 'create', '--data', '{"name":"Demo","provider":"demo","credentials":{"token":"hidden-secret"}}');
    expect(result.code).toBe(0); expect(result.stdout).not.toContain('hidden-secret'); expect(result.data.request.body.credentials).toBe('[redacted]'); expect(calls).toHaveLength(0);
  });
  it('instantiates complete apps through the platform template service', async () => {
    response = { data: { applicationId: 'complete-app', membersCreated: 3 } };
    expect((await run('apps', 'create', '--template', 'template')).data).toEqual(response);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/services/app/templates', body: { templateId: 'template' } });
  });
  it('previews template instantiation without fetching or creating anything', async () => {
    const result = await run('apps', 'create', '--template', 'template', '--dry-run');
    expect(result.data).toMatchObject({ dryRun: true, writesPerformed: false, plan: { body: { templateId: 'template' } } }); expect(calls).toHaveLength(0);
    expect((await run('apps', 'create', '--template', 'template', '--data', '{}')).code).toBe(2); expect(calls).toHaveLength(0);
  });

});
