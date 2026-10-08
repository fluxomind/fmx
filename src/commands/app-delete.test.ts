import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const exec = promisify(execFile);
const id = '00000000-0000-7000-8000-000000000001';
const tenant = '00000000-0000-7000-8000-000000000002';
const root = mkdtempSync(join(tmpdir(), 'fmx-delete-'));
let server: Server, origin: string;
let calls: { method: string; path: string }[], removed: boolean, status: string, refusal: number | undefined;
async function run(args: string[]) {
  try { const r = await exec(process.execPath, [resolve('dist/bin.js'), '--format', 'json', ...args], { env: { ...process.env, FLUXOMIND_API_URL: origin, FLUXOMIND_ACCESS_TOKEN: 'opaque-test', FMX_READ_ONLY: '0' } }); return { code: 0, data: JSON.parse(r.stdout) }; }
  catch (error) { const r = error as { code: number; stdout: string }; return { code: r.code, data: JSON.parse(r.stdout) }; }
}
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, origin); calls.push({ method: req.method!, path: req.url! });
    let body: unknown = { success: true, data: [], rowLimit: { applied: 200 } }; let code = 200;
    if (url.pathname === '/api/v1/session-check') body = { tokenUser: { tenantId: tenant, userId: 'user' } };
    else if (req.method === 'DELETE') {
      if (refusal) { code = refusal; body = { error: 'Denied' }; } else { removed = true; body = { success: true }; }
    } else if (url.searchParams.get('id') === id) body = { id, name: 'Empty draft', namespace: 'empty', status, tenant_id: tenant };
    else if (url.searchParams.get('entityApiParam') === 'fm__application' && !removed) body = { success: true, data: [{ id }], rowLimit: { applied: 200 } };
    else if (url.searchParams.get('entityApiParam') === 'fm__object') body = { success: true, data: [{ id: 'app-metadata', api_name: 'fm__application' }], rowLimit: { applied: 200 } };
    res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body));
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(done => server.close(() => done())); rmSync(root, { recursive: true, force: true }); });
beforeEach(() => { calls = []; removed = false; status = 'draft'; refusal = undefined; });
describe('apps delete CLI HTTP boundary', () => {
  it('makes offline previews and usage rejection without HTTP', async () => {
    expect((await run(['apps', 'delete', id, '--dry-run'])).data.scope).toBe('offline-intent-only');
    expect((await run(['apps', 'delete', id])).code).toBe(2);
    expect((await run(['apps', 'delete', id, '--confirm', tenant, '--receipt', join(root, 'bad.json')])).code).toBe(2);
    expect(calls).toEqual([]);
  });
  it('inventories with GET only and stores a private report without overwriting it', async () => {
    const out = join(root, 'preview.json');
    const result = await run(['apps', 'delete', id, '--dry-run', '--remote', '--read-only', '--out', out]);
    expect(result.code).toBe(0); expect(result.data.executable).toBe(true); expect(result.data.writesPerformed).toBe(false);
    expect(calls.every(c => c.method === 'GET')).toBe(true);
    expect(JSON.parse(readFileSync(out, 'utf8')).app.id).toBe(id); expect(statSync(out).mode & 0o777).toBe(0o600);
    calls = []; expect((await run(['apps', 'delete', id, '--dry-run', '--remote', '--out', out])).code).toBe(2); expect(calls).toEqual([]);
  });
  it('executes a verified empty draft deletion with a private receipt', async () => {
    const receipt = join(root, 'receipt.json');
    const result = await run(['apps', 'delete', id, '--confirm', id, '--expected-tenant', tenant, '--receipt', receipt]);
    expect(result.code).toBe(0); expect(result.data.outcome).toBe('verified');
    expect(calls.filter(c => c.method === 'DELETE')).toEqual([{ method: 'DELETE', path: '/api/v1/dataEngine?entityApiParam=fm__application&id=' + id }]);
    expect(JSON.parse(readFileSync(receipt, 'utf8')).outcome).toBe('verified'); expect(statSync(receipt).mode & 0o777).toBe(0o600);
  });
  it('blocks published apps and read-only execution without DELETE', async () => {
    status = 'published';
    const result = await run(['apps', 'delete', id, '--confirm', id, '--receipt', join(root, 'blocked.json')]);
    expect(result.code).toBe(1); expect(result.data.outcome).toBe('blocked');
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
    calls = []; expect((await run(['apps', 'delete', id, '--confirm', id, '--read-only', '--receipt', join(root, 'readonly.json')])).code).toBe(1); expect(calls).toEqual([]);
  });
  it('stops after one refused/failed DELETE without retries', async () => {
    for (const code of [403, 500]) {
      calls = []; refusal = code;
      const result = await run(['apps', 'delete', id, '--confirm', id, '--receipt', join(root, `refused-${code}.json`)]);
      expect(result.code).toBe(1); expect(result.data.outcome).toBe('stopped');
      expect(calls.filter(c => c.method === 'DELETE')).toHaveLength(1);
      expect(result.data.failed.state).toBe(code === 403 ? 'rejected' : 'unknown');
    }
  });
});
