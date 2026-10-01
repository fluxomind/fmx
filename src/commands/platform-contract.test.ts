import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const execute = promisify(execFile);
interface Captured { method?: string; path: string; headers: Record<string, unknown>; body?: any }
let server: Server; let origin: string; let calls: Captured[] = []; let status = 200; let response: unknown;
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
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(response));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); });
beforeEach(() => { calls = []; status = 200; response = { success: true }; });
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

});
