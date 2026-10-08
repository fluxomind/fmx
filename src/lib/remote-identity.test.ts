import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ get: vi.fn(), resolveTargetTenant: vi.fn() }));
vi.mock('./api-client', () => fixture);
import { remoteIdentity } from './remote-identity';
const tenant = '00000000-0000-7000-8000-000000000001';
const tokenBefore = process.env.FLUXOMIND_ACCESS_TOKEN;
beforeEach(() => {
  delete process.env.FLUXOMIND_ACCESS_TOKEN;
  fixture.resolveTargetTenant.mockReturnValue('default');
  fixture.get.mockResolvedValue({ tokenUser: { tenantId: tenant, userId: 'user' }, rawCookieHeader: 'private' });
});
afterEach(() => { if (tokenBefore === undefined) delete process.env.FLUXOMIND_ACCESS_TOKEN; else process.env.FLUXOMIND_ACCESS_TOKEN = tokenBefore; vi.clearAllMocks(); });
describe('OAuth default session identity', () => {
  it('uses the verified UUID for the default storage alias without rendering credentials', async () => {
    expect(await remoteIdentity()).toEqual({ tenantId: tenant, userId: 'user' });
  });
  it('still rejects a different explicitly selected tenant', async () => {
    await expect(remoteIdentity('00000000-0000-7000-8000-000000000002')).rejects.toThrow('differs');
  });
});
