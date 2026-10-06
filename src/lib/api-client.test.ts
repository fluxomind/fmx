import { vi, describe, it, expect, afterEach } from 'vitest';
import { apiRequest } from './api-client';
import { actionableError } from './actionable-error';
const auth = vi.hoisted(() => ({ token: 'secret-test-token' }));
vi.mock('./config-manager', () => ({ loadConfig: () => ({ defaultTenant: 'tenant' }), resolveApiUrl: () => 'https://example.test' }));
vi.mock('./auth-manager', () => ({ getStoredTenants: () => ['tenant'], getTenantAuth: () => ({ accessToken: auth.token }), getAuthToken: () => null }));
vi.mock('./auth-refresh', () => ({ refreshIfExpired: vi.fn(), forceRefresh: async () => { auth.token = 'refreshed-session'; return { refreshed: true }; } }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); auth.token = 'secret-test-token'; });
describe('session transport and forbidden responses', () => {
  it('passes the internal middleware and validates the saved session at the handler', async () => {
    vi.stubEnv('FLUXOMIND_ACCESS_TOKEN', undefined);
    const fetchMock = vi.fn(async (_url, init) => {
      if (init.headers.Cookie !== 'session=secret-test-token') {
        return Response.json({ error: 'forbidden_internal_api' }, { status: 403 });
      }
      expect(init.headers.Authorization).toBe('Bearer secret-test-token');
      expect(init.headers['x-internal-call']).toBeUndefined();
      return Response.json({ objectId: 'created' });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiRequest({ method: 'POST', path: '/api/services/modelling/objects' })).toEqual({ objectId: 'created' });
  });
  it('does not send a session cookie to public or lookalike paths', async () => {
    vi.stubEnv('FLUXOMIND_ACCESS_TOKEN', undefined);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    for (const path of ['/api/v1/metadata/objects', '/api/services-other/test', '//other.test/api/services/test']) {
      await apiRequest({ method: 'GET', path });
    }
    for (const call of fetchMock.mock.calls) expect(call[1].headers.Cookie).toBeUndefined();
  });
  it('keeps environment tokens as Bearer and preserves middleware denial without retry', async () => {
    vi.stubEnv('FLUXOMIND_ACCESS_TOKEN', 'environment-token');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: 'forbidden_internal_api', message: 'Internal services API blocked by middleware' }, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest({ method: 'POST', path: '/api/services/modelling/objects' })).rejects.toMatchObject({ statusCode: 403, code: 'forbidden_internal_api', message: 'Internal services API blocked by middleware' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Cookie).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer environment-token');
  });
  it('renews both session transports after a 401', async () => {
    vi.stubEnv('FLUXOMIND_ACCESS_TOKEN', undefined);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest({ method: 'POST', path: '/api/services/modelling/objects' });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer refreshed-session', Cookie: 'session=refreshed-session' });
  });
  it('preserves capacity errors instead of recommending another login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code: 'STRUCTURAL_CAPACITY_EXCEEDED', message: 'Capacity reached', details: { used: 10, limit: 10 } } }, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const err = await apiRequest({ method: 'POST', path: '/mutation' }).catch(error => error);
    expect(err).toMatchObject({ statusCode: 403, code: 'STRUCTURAL_CAPACITY_EXCEEDED', details: { used: 10, limit: 10 } });
    expect(actionableError(err).help).toContain('capacity increase');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
describe('HTTP retry contract', () => {
  it('retains the mutation idempotency key across an authentication retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiRequest({ method: 'POST', path: '/mutation', body: { value: 1 } })).toEqual({ ok: true });
    const first = fetchMock.mock.calls[0][1].headers;
    const second = fetchMock.mock.calls[1][1].headers;
    expect(first['Idempotency-Key']).toBeTruthy();
    expect(second['Idempotency-Key']).toBe(first['Idempotency-Key']);
  });
  it('does not repeat a rejected client request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest({ method: 'POST', path: '/mutation' })).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not retry successful empty responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await apiRequest({ method: 'DELETE', path: '/record' })).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not retry a mutation after a malformed success response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('invalid JSON', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest({ method: 'POST', path: '/mutation' })).rejects.toThrow('invalid JSON');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not automatically repeat a mutation on server failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('failed', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest({ method: 'POST', path: '/mutation' })).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});
