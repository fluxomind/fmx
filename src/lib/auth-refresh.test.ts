import { describe, it, expect, vi } from 'vitest';
import { forceRefresh } from './auth-refresh';
vi.mock('./auth-manager', () => ({ getTenantAuth: () => ({ refreshToken: 'old' }), saveTokens: vi.fn() }));
vi.mock('./config-manager', () => ({ resolveApiUrl: () => 'https://example.test' }));
describe('rotating refresh token', () => {
  it('shares one in-flight refresh per tenant', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetchMock = vi.fn(async () => { await gate; return Response.json({ accessToken: 'new', refreshToken: 'rotated', expiresAt: new Date(Date.now()+3600000).toISOString() }); });
    const a = forceRefresh('tenant', fetchMock), b = forceRefresh('tenant', fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1); release();
    expect(await a).toEqual(await b);
    await forceRefresh('tenant', fetchMock); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
