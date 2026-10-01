import { vi, describe, it, expect, afterEach } from 'vitest';
import { apiRequest } from './api-client';
vi.mock('./config-manager', () => ({ loadConfig: () => ({ defaultTenant: 'tenant' }), resolveApiUrl: () => 'https://example.test' }));
vi.mock('./auth-manager', () => ({ getStoredTenants: () => ['tenant'], getTenantAuth: () => ({ accessToken: 'secret-test-token' }), getAuthToken: () => null }));
vi.mock('./auth-refresh', () => ({ refreshIfExpired: vi.fn(), forceRefresh: async () => ({ refreshed: true }) }));
afterEach(() => vi.unstubAllGlobals());
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
