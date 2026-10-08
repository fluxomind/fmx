import { get, resolveTargetTenant } from './api-client';
export async function remoteIdentity(tenant?: string): Promise<{ tenantId: string; userId: string }> {
  // Project only the verified identity; the diagnostic endpoint's cookie fields are never rendered.
  const result = await get<{ tokenUser?: { tenantId?: string; userId?: string } }>('/api/v1/session-check', tenant);
  if (!result.tokenUser?.tenantId || !result.tokenUser.userId) throw new Error('Platform did not return an authenticated identity');
  const selected = tenant ?? (process.env.FLUXOMIND_ACCESS_TOKEN ? undefined : resolveTargetTenant());
  // Browser login without --tenant stores a session under the routing alias "default".
  // It is not a tenant identity; the verified server UUID is authoritative for that alias.
  if (selected && selected !== 'default' && result.tokenUser.tenantId !== selected) throw new Error('Authenticated tenant differs from the selected tenant');
  return { tenantId: result.tokenUser.tenantId, userId: result.tokenUser.userId };
}
