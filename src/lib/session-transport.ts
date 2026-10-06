import { loadConfig } from './config-manager';
import { getAuthToken, getStoredTenants, getTenantAuth } from './auth-manager';
import { projectContext } from './project-context';

export function resolveTargetTenant(explicit?: string): string | undefined {
  return explicit ?? projectContext()?.tenant ?? loadConfig().defaultTenant ?? getStoredTenants()[0];
}

export function sessionHeaders(path: string, tenant?: string): Record<string, string> {
  const envToken = process.env.FLUXOMIND_ACCESS_TOKEN || undefined;
  const selected = envToken ? undefined : resolveTargetTenant(tenant);
  const token = envToken ?? (selected ? getTenantAuth(selected)?.accessToken : getAuthToken());
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
    ...(!envToken && path.startsWith('/api/services/') ? { Cookie: `session=${encodeURIComponent(token)}` } : {}),
  };
}
