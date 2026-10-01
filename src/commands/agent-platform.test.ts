import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const exec = promisify(execFile);
const tenant = '00000000-0000-7000-8000-000000000001';
const jwt = 'fixture.' + Buffer.from(JSON.stringify({ tenantId: tenant })).toString('base64url') + '.fixture';
let server: Server; let origin: string; let calls: { method: string; path: string; body: any; headers: any }[];
let respond: (method: string, path: URL, body: any) => { status?: number; data: unknown };
const temp = mkdtempSync(join(tmpdir(), 'fmx-agent-platform-'));
async function run(args: string[], env: Record<string, string> = {}) {
  try { const r = await exec(process.execPath, [resolve('dist/bin.js'), '--format', 'json', ...args], { env: { ...process.env, FLUXOMIND_ACCESS_TOKEN: jwt, FLUXOMIND_API_URL: origin, FMX_READ_ONLY: '0', FLUXOMIND_DISABLE_METRICS: '1', ...env } }); return { code: 0, data: JSON.parse(r.stdout) }; }
  catch (err) { const e = err as { code: number; stdout: string }; return { code: e.code, data: JSON.parse(e.stdout) }; }
}
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c));
    const text = Buffer.concat(chunks).toString(); const body = text ? JSON.parse(text) : undefined;
    calls.push({ method: req.method!, path: req.url!, body, headers: req.headers });
    const r = respond(req.method!, new URL(req.url!, origin), body);
    res.writeHead(r.status ?? 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.data));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); rmSync(temp, { recursive: true, force: true }); });
beforeEach(() => { calls = []; respond = () => ({ data: { success: true } }); });
describe('Domain operations and agent contracts', () => {
  it.each([
    [['apps', 'components', 'create', '--data', '{"page_id":"page","component_type":"Text","props":{"text":"Demo"}}'], 'POST', '/api/services/appEngine/page-component', { page_id: 'page', component_type: 'Text', props: { text: 'Demo' } }],
    [['apps', 'components', 'update', 'component', '--data', '{"version":4,"props":{"text":"Changed"}}'], 'PATCH', '/api/services/appEngine/page-component', { id: 'component', version: 4, props: { text: 'Changed' } }],
    [['apps', 'components', 'delete', 'component'], 'DELETE', '/api/services/appEngine/page-component', { id: 'component' }],
    [['agent', 'workers', 'link', 'agent', '--data', '{"workerId":"worker","isActive":false}'], 'POST', '/api/agent-studio/agents/agent/workers', { workerId: 'worker', isActive: false }],
    [['agent', 'workers', 'update', 'agent', 'binding', '--data', '{"toolPrefixes":["data_"],"displayOrder":0}'], 'PUT', '/api/agent-studio/agents/agent/workers/binding', { toolPrefixes: ['data_'], displayOrder: 0 }],
    [['agent', 'workers', 'unlink', 'agent', 'binding'], 'DELETE', '/api/agent-studio/agents/agent/workers/binding', undefined],
    [['agent', 'knowledge', 'unlink', 'agent', 'junction'], 'DELETE', '/api/agent-studio/agents/agent/knowledge/junction', undefined],
    [['agent', 'tools', 'set', 'agent', '--data', '{"tools":["data_records_find"]}'], 'PUT', '/api/agent-studio/agents/agent', { tools: ['data_records_find'] }],
    [['workflow', 'approvals', 'delegate', 'task', '--data', '{"toUserId":"user","reason":"coverage"}'], 'POST', '/api/workflow/approvals', { taskId: 'task', action: 'delegate', toUserId: 'user', reason: 'coverage' }],
    [['jobs', 'cancel', 'job', '--data', '{"reason":"obsolete"}'], 'POST', '/api/v1/queueEngine/jobs/job/cancel', { reason: 'obsolete' }],
    [['jobs', 'retry', 'job'], 'POST', '/api/v1/queueEngine/jobs/job/retry', undefined],
    [['model', 'update-object', 'demo', '--data', '{"api_name":"new_alias","reratificationGateId":"gate"}'], 'PATCH', '/api/services/modelling/objects/demo', { api_name: 'new_alias', reratificationGateId: 'gate' }],
    [['policy', 'decide', 'request', '--data', '{"decision":"approve","reason":"Reviewed"}'], 'POST', '/api/services/policyEngine/hitl/resolve', { request_id: 'request', decision: 'approve', reason: 'Reviewed' }],
  ] as [string[], string, string, unknown][])('uses the domain service for %j', async (args, method, path, body) => {
    const r = await run(args); expect(r.code).toBe(0); expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method, path }); expect(calls[0].body).toEqual(body);
    expect(calls[0].headers['x-correlation-id']).toBe(calls[0].headers['idempotency-key']);
  });
  it('rejects unknown and empty update fields before any request', async () => {
    for (const data of ['{"prosp":{}}', '{}']) expect((await run(['apps', 'components', 'update', 'id', '--data', data])).code).toBe(2);
    expect((await run(['agent', 'workers', 'link', 'agent', '--data', '{"workerID":"typo"}'])).code).toBe(2);
    expect(calls).toHaveLength(0);
  });
  it('distinguishes a held model change from a completed mutation', async () => {
    respond = () => ({ status: 202, data: { held: true, reason: 'Review required', reratificationGateId: 'gate', impact: {} } });
    const r = await run(['model', 'update-object', 'demo', '--data', '{"api_name":"new_alias"}']);
    expect(r.code).toBe(0); expect(r.data).toMatchObject({ outcome: 'held', completed: false, reratificationGateId: 'gate' }); expect(calls).toHaveLength(1);
  });
  it('requires an adjusted payload only for an adjusted policy decision', async () => {
    expect((await run(['--dry-run', 'policy', 'decide', 'request', '--data', '{"decision":"adjust"}'])).code).toBe(2);
    expect((await run(['--dry-run', 'policy', 'decide', 'request', '--data', '{"decision":"approve","adjusted_payload":{}}'])).code).toBe(2); expect(calls).toHaveLength(0);
  });
  it('publishes the same strict payload schema and write effect in the command catalog', async () => {
    const r = await run(['catalog', 'apps', 'components', 'create']);
    expect(r.data.command.contract).toMatchObject({ method: 'POST', effects: ['write'], inputSchema: { required: ['page_id', 'component_type'], additionalProperties: false } });
    expect(calls).toHaveLength(0);
  });
  it('bounds source-window lists and carries IDs, fields and tenant into continuation', async () => {
    respond = () => ({ data: { success: true, data: Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: 'Entry', type: 'text', sourceType: 'user' })) } });
    const r = await run(['agent', 'knowledge', 'available', 'agent', '--tenant', tenant, '--limit', '2', '--fields', 'id,name']);
    expect(r.data).toMatchObject({ count: 2, total: null, sourceCount: 40, paginationScope: 'returned-source-window', hasMore: true });
    expect(r.data.next.args).toEqual(['agent', 'knowledge', 'available', 'agent', '--offset', '2', '--limit', '2', '--tenant', tenant, '--fields', 'id,name']);
    expect(Object.keys(r.data.data[0])).toEqual(['id', 'name']);
  });
  it('observes an existing job until completion using GET only', async () => {
    let count = 0; respond = () => ({ data: { success: true, data: { jobId: 'job', status: ++count === 1 ? 'processing' : 'completed' } } });
    const r = await run(['jobs', 'wait', 'job', '--interval', '10']); expect(r.code).toBe(0); expect(r.data.outcome).toBe('completed');
    expect(calls).toHaveLength(2); expect(calls.every(c => c.method === 'GET')).toBe(true);
  });
  it('reports job failure and bounded observation without restarting or cancelling work', async () => {
    respond = () => ({ data: { success: true, data: { jobId: 'job', status: 'failed', error: 'Failure detail' } } });
    let r = await run(['jobs', 'wait', 'job']); expect(r.code).toBe(1); expect(r.data.error).toBe('Failure detail');
    respond = () => ({ data: { success: true, data: { jobId: 'job', status: 'processing' } } }); calls = [];
    r = await run(['jobs', 'wait', 'job', '--timeout', '60', '--interval', '10']); expect(r.code).toBe(1); expect(r.data).toMatchObject({ outcome: 'timeout', continuesOnServer: true });
    expect(calls.every(c => c.method === 'GET')).toBe(true);
  });
  it('validates schedule recurrence and previews its governed request without HTTP', async () => {
    const args = ['--dry-run', 'jobs', 'schedules', 'create', '--data'];
    const payload = { name: 'Daily', jobTypeKey: 'demo', timezone: 'America/Sao_Paulo', recurrenceSpec: { mode: 'daily', at: '09:00' } };
    const r = await run([...args, JSON.stringify(payload)]); expect(r.code).toBe(0); expect(r.data.request.body).toEqual(payload);
    expect((await run([...args, JSON.stringify({ ...payload, recurrenceSpec: { mode: 'daily', at: '25:00' } })])).code).toBe(2); expect(calls).toHaveLength(0);
  });
  it('blocks mutations in read-only mode and allows dry-run previews without HTTP', async () => {
    const args = ['jobs', 'retry', 'job'];
    expect((await run(['--read-only', ...args])).data.code).toBe('READ_ONLY_MODE');
    expect((await run(args, { FMX_READ_ONLY: '1' })).code).toBe(1);
    expect((await run(['--dry-run', ...args], { FMX_READ_ONLY: '1' })).data.writesPerformed).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('blocks legacy deploy before it can reach a separate HTTP path', async () => {
    expect((await run(['deploy'], { FMX_READ_ONLY: '1' })).code).toBe(2); expect(calls).toHaveLength(0);
  });
  it('preserves denial instead of retrying mutations or manufacturing empty success', async () => {
    respond = () => ({ status: 403, data: { error: 'Forbidden' } });
    const r = await run(['agent', 'tools', 'set', 'agent', '--data', '{"tools":[]}']);
    expect(r.code).toBe(1); expect(r.data.code).toBe('PERMISSION_DENIED'); expect(r.data.requestId).toBeTruthy(); expect(calls).toHaveLength(1);
  });
  it('returns record-specific capabilities without inferring create permission', async () => {
    respond = () => ({ data: { id: 'one', _capabilities: { one: { canUpdate: false, canDelete: false } }, confidential: 'not needed' } });
    const r = await run(['access', 'record', 'demo__request', 'one']);
    expect(r.data.capabilities).toEqual({ canUpdate: false, canDelete: false }); expect(r.data.confidential).toBeUndefined(); expect(calls[0].method).toBe('GET');
  });
  it('keeps dashboard sections useful while reporting individual permission failures', async () => {
    respond = (_, path) => path.pathname.includes('queueEngine') ? { status: 403, data: {} } : { data: { success: true, data: [], rowLimit: { exact: true }, totalRecords: 0 } };
    const r = await run(['dashboard']); expect(r.code).toBe(1); expect(r.data.partial).toBe(true);
    expect(r.data.sections.filter((s: any) => s.ok)).toHaveLength(2); expect(calls).toHaveLength(3); expect(calls.every(c => c.method === 'GET')).toBe(true);
  });
  it('ingests only supported text fields and uses the selected tenant in the body', async () => {
    const r = await run(['knowledge', 'ingest', 'knowledge', '--tenant', tenant, '--data', '{"text":"Demo"}']);
    expect(r.code).toBe(0); expect(calls[0].body).toEqual({ tenantId: tenant, knowledgeId: 'knowledge', text: 'Demo' });
    expect((await run(['knowledge', 'ingest', 'knowledge', '--tenant', tenant, '--data', '{"text":"Demo","generateEmbeddings":false}'])).code).toBe(2);
    expect(calls).toHaveLength(1);
  });
});

describe('Declarative record plans', () => {
  let manifestFile: string; let planFile: string; let remote: Record<string, any>;
  beforeEach(() => {
    manifestFile = join(temp, 'manifest.json'); planFile = join(temp, `plan-${Math.random()}.json`); remote = { one: { id: 'one', name: 'Before', enabled: false }, two: { id: 'two', name: 'Before', enabled: false } };
    respond = (method, path, body) => {
      if (path.pathname.includes('metadata')) return { data: { fields: ['id', 'name', 'enabled'].map(apiName => ({ apiName })) } };
      if (method === 'GET' && path.searchParams.has('id')) return { data: remote[path.searchParams.get('id')!] };
      if (method === 'GET') return { data: { success: true, data: [], rowLimit: { applied: 2, exact: false } } };
      if (method === 'PUT') { remote[body.id] = { ...remote[body.id], ...body.payload }; return { data: remote[body.id] }; }
      return { data: { id: 'created' } };
    };
  });
  function manifest(resources: unknown[]) { writeFileSync(manifestFile, JSON.stringify({ apiVersion: 'fmx/v1', apiOrigin: origin, tenant, resources })); }
  async function plan(resources: unknown[]) { manifest(resources); return run(['resources', 'plan', '--file', manifestFile, '--remote', '--out', planFile]); }
  it('validates offline and never runs code or sends HTTP', async () => {
    manifest([{ key: 'first', object: 'demo__request', id: 'one', data: { name: 'Demo' } }]);
    expect((await run(['resources', 'validate', '--file', manifestFile])).code).toBe(0);
    expect((await run(['resources', 'plan', '--file', manifestFile])).data.state).toBe('not-observed'); expect(calls).toHaveLength(0);
  });
  it('plans update/create/noop using reads, caching field schemas per object', async () => {
    const r = await plan([{ key: 'first', object: 'demo__request', id: 'one', data: { name: 'Changed' } }, { key: 'second', object: 'demo__request', id: 'two', data: { enabled: false } }, { key: 'new', object: 'demo__request', match: { name: 'New' }, data: { name: 'New', enabled: true } }]);
    expect(r.code).toBe(0); expect(r.data.changes.map((c: any) => c.action)).toEqual(['update', 'noop', 'create']);
    expect(calls.every(c => c.method === 'GET')).toBe(true); expect(calls.filter(c => c.path.includes('metadata'))).toHaveLength(1);
    const artifact = JSON.parse(readFileSync(planFile, 'utf8')); expect(artifact.operations[0].expectedValues).toEqual({ name: 'Before' });
  });
  it('previews an entire reviewed plan with zero network calls', async () => {
    await plan([{ key: 'first', object: 'demo__request', id: 'one', data: { name: 'Changed' } }]); calls = [];
    const r = await run(['--dry-run', 'resources', 'apply', '--file', planFile], { FMX_READ_ONLY: '1' });
    expect(r.code).toBe(0); expect(r.data).toMatchObject({ writesPerformed: false, state: 'not-rechecked' }); expect(calls).toHaveLength(0);
  });
  it('rechecks all baselines before any write, then forwards expectedValues', async () => {
    await plan([{ key: 'first', object: 'demo__request', id: 'one', data: { name: 'Changed' } }, { key: 'second', object: 'demo__request', id: 'two', data: { enabled: true } }]); calls = [];
    const r = await run(['resources', 'apply', '--file', planFile]); expect(r.code).toBe(0); expect(r.data.success).toBe(true);
    expect(calls.map(c => c.method)).toEqual(['GET', 'GET', 'PUT', 'PUT']); expect(calls[2].body).toEqual({ id: 'one', payload: { name: 'Changed' }, expectedValues: { name: 'Before' } });
  });
  it('refuses a stale plan before performing any write', async () => {
    await plan([{ key: 'first', object: 'demo__request', id: 'one', data: { name: 'Changed' } }]); remote.one.name = 'Concurrent edit'; calls = [];
    const r = await run(['resources', 'apply', '--file', planFile]); expect(r.code).toBe(2); expect(r.data.error).toContain('baseline changed'); expect(calls.every(c => c.method === 'GET')).toBe(true);
  });
  it('preserves successful writes and conflict details and stops after a partial failure', async () => {
    await plan(['one', 'two'].map((id, i) => ({ key: String(i), object: 'demo__request', id, data: { name: 'Changed' } }))); calls = [];
    const original = respond;
    respond = (method, path, body) => method === 'PUT' && body.id === 'two' ? { status: 409, data: { message: 'Concurrent edit', error: { code: 'DATAENGINE_CONDITIONAL_WRITE_CONFLICT' }, conflict: { mismatches: [{ field: 'name', expected: 'Before' }] } } } : original(method, path, body);
    const r = await run(['resources', 'apply', '--file', planFile]); expect(r.code).toBe(1); expect(r.data.results).toHaveLength(2);
    expect(r.data.results[0].success).toBe(true); expect(r.data.results[1]).toMatchObject({ success: false, code: 'DATAENGINE_CONDITIONAL_WRITE_CONFLICT', operationState: 'rejected' }); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(2);
    expect(r.data.results[1].details.mismatches[0].field).toBe('name');
  });
  it('does not retry an ambiguous creation or continue to later changes', async () => {
    await plan([{ key: 'new', object: 'demo__request', match: { name: 'New' }, data: { name: 'New' } }, { key: 'later', object: 'demo__request', id: 'one', data: { name: 'Changed' } }]); calls = [];
    const original = respond; respond = (method, path, body) => method === 'POST' ? { status: 503, data: { error: 'Unavailable' } } : original(method, path, body);
    const r = await run(['resources', 'apply', '--file', planFile]); expect(r.code).toBe(1); expect(r.data.remaining).toEqual(['later']); expect(r.data.results[0].operationState).toBe('unknown'); expect(calls.filter(c => c.method === 'POST')).toHaveLength(1); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(0);
  });
  it('treats HTTP success without a created identity as unknown and stops later writes', async () => {
    await plan([{ key: 'new', object: 'demo__request', match: { name: 'New' }, data: { name: 'New' } }, { key: 'later', object: 'demo__request', id: 'one', data: { name: 'Changed' } }]); calls = [];
    const original = respond; respond = (method, path, body) => method === 'POST' ? { status: 201, data: { success: true } } : original(method, path, body);
    const r = await run(['resources', 'apply', '--file', planFile]); expect(r.code).toBe(1); expect(r.data.results[0]).toMatchObject({ success: false, operationState: 'unknown', code: 'UNCONFIRMED_WRITE_RESULT' }); expect(r.data.remaining).toEqual(['later']);
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(0);
  });
  it('rejects unknown fields, sensitive values, ambiguous identities and target mismatch before writes', async () => {
    expect((await plan([{ key: 'bad', object: 'demo__request', id: 'one', data: { enabledTypo: true } }])).code).toBe(2);
    manifest([{ key: 'bad', object: 'demo__request', id: 'one', data: { credentials: { token: 'secret' } } }]); expect((await run(['resources', 'validate', '--file', manifestFile])).code).toBe(2);
    manifest([{ key: 'bad', object: 'demo__request', id: 'one', match: { name: 'Before' }, data: { name: 'Changed' } }]); expect((await run(['resources', 'validate', '--file', manifestFile])).code).toBe(2);
    const r = await plan([{ key: 'ok', object: 'demo__request', id: 'one', data: { name: 'Changed' } }]); expect(r.code).toBe(0);
    calls = []; const artifact = JSON.parse(readFileSync(planFile, 'utf8')); artifact.apiOrigin = 'https://other.example'; writeFileSync(planFile, JSON.stringify(artifact));
    expect((await run(['resources', 'apply', '--file', planFile])).code).toBe(2); expect(calls).toHaveLength(0);
  });
  it('rejects duplicate resolved targets, edited noop plans and system table mutations', async () => {
    expect((await plan([{ key: 'first', object: 'demo__request', id: 'one', data: { name: 'Changed' } }, { key: 'same', object: 'demo__request', id: 'one', data: { enabled: true } }])).code).toBe(2);
    await plan([{ key: 'first', object: 'demo__request', id: 'one', data: { name: 'Changed' } }]); calls = [];
    const artifact = JSON.parse(readFileSync(planFile, 'utf8')); artifact.operations[0].action = 'noop'; writeFileSync(planFile, JSON.stringify(artifact));
    expect((await run(['resources', 'apply', '--file', planFile])).code).toBe(2); expect(calls).toHaveLength(0);
    artifact.operations[0].action = 'update'; artifact.operations[0].object = 'fm__object'; writeFileSync(planFile, JSON.stringify(artifact));
    expect((await run(['resources', 'apply', '--file', planFile])).code).toBe(2); expect(calls).toHaveLength(0);
  });
});
