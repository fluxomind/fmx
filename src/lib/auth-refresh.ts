/**
 * Auth refresh helper — silently renews accessToken using refreshToken before it expires.
 * @package @fluxomind/cli
 */

import { resolveApiUrl } from './config-manager';
import { getTenantAuth, saveTokens } from './auth-manager';

const REFRESH_BUFFER_MS = 60_000;
const pending = new Map<string, Promise<RefreshOutcome>>();
function renew(tenant: string, token: string, fetchFn: typeof fetch): Promise<RefreshOutcome> {
  const existing = pending.get(tenant);
  if (existing) return existing;
  const work = performRefresh(tenant, token, fetchFn).finally(() => { pending.delete(tenant); });
  pending.set(tenant, work);
  return work;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface RefreshOutcome {
  refreshed: boolean;
  accessToken?: string;
}

export async function refreshIfExpired(
  tenant?: string,
  fetchFn: typeof fetch = fetch,
): Promise<RefreshOutcome> {
  if (!tenant) {
    return { refreshed: false };
  }

  const current = getTenantAuth(tenant);
  if (!current || !current.refreshToken) return { refreshed: false };

  const needsRefresh =
    typeof current.expiresAt === 'number' && current.expiresAt - Date.now() < REFRESH_BUFFER_MS;
  if (!needsRefresh) return { refreshed: false };

  return renew(tenant, current.refreshToken, fetchFn);
}

export async function forceRefresh(
  tenant: string,
  fetchFn: typeof fetch = fetch,
): Promise<RefreshOutcome> {
  const current = getTenantAuth(tenant);
  if (!current || !current.refreshToken) return { refreshed: false };
  return renew(tenant, current.refreshToken, fetchFn);
}

async function performRefresh(
  tenant: string,
  refreshToken: string,
  fetchFn: typeof fetch,
): Promise<RefreshOutcome> {
  const response = await fetchFn(`${resolveApiUrl()}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    return { refreshed: false };
  }
  const payload = (await response.json()) as RefreshResponse;
  if (!payload.accessToken || !payload.refreshToken || !payload.expiresAt) throw new Error('Invalid authentication refresh response');
  const expiresAt = Date.parse(payload.expiresAt);
  const current = getTenantAuth(tenant);
  saveTokens(tenant, {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: Number.isNaN(expiresAt) ? undefined : expiresAt,
    email: current?.email,
  });
  return { refreshed: true, accessToken: payload.accessToken };
}
