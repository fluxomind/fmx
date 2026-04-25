/**
 * Session resolver — decodes FLUXOMIND_MCP_* env vars and validates token via HTTP verify.
 *
 * Consumed by `bin.ts` on MCP server startup. Failure → throw (bin.ts exits 1).
 *
 * @package @/engine/codeEngine/mcp
 */

import type { McpSessionContext } from './types';

export const ENV_AUTH_TOKEN = 'FLUXOMIND_MCP_AUTH_TOKEN';
export const ENV_TENANT = 'FLUXOMIND_MCP_TENANT';
export const ENV_API_BASE = 'FLUXOMIND_MCP_API_BASE';

const DEFAULT_API_BASE = 'https://platform.fluxomind.com';

export class McpAuthError extends Error {
  readonly code: 'MISSING_TOKEN' | 'MISSING_TENANT' | 'VERIFY_FAILED' | 'NETWORK_ERROR';
  readonly statusCode?: number;

  constructor(
    code: 'MISSING_TOKEN' | 'MISSING_TENANT' | 'VERIFY_FAILED' | 'NETWORK_ERROR',
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = 'McpAuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ResolvedEnv {
  token: string;
  tenant: string;
  apiBase: string;
}

export function readEnv(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): ResolvedEnv {
  const token = env[ENV_AUTH_TOKEN]?.trim();
  const tenant = env[ENV_TENANT]?.trim();
  const apiBase = (env[ENV_API_BASE]?.trim() || DEFAULT_API_BASE).replace(/\/$/, '');

  if (!token) {
    throw new McpAuthError(
      'MISSING_TOKEN',
      `${ENV_AUTH_TOKEN} is required. Run 'fmx auth login' and restart 'fmx mcp serve'.`,
    );
  }
  if (!tenant) {
    throw new McpAuthError(
      'MISSING_TENANT',
      `${ENV_TENANT} is required. Run 'fmx auth login' to select a tenant.`,
    );
  }
  return { token, tenant, apiBase };
}

export interface VerifyResponse {
  userId: string;
  tenantId: string;
  schemaName: string;
  userName: string | null;
  userEmail: string | null;
  roles: string[];
  tokenValid: boolean;
}

type FetchFn = typeof fetch;

export async function verifyToken(
  env: ResolvedEnv,
  fetchImpl: FetchFn = fetch,
): Promise<VerifyResponse> {
  const url = `${env.apiBase}/api/v1/auth/session/verify`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.token}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
  } catch (err) {
    throw new McpAuthError(
      'NETWORK_ERROR',
      `Failed to reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new McpAuthError('VERIFY_FAILED', `Token verification failed (HTTP ${response.status})`, response.status);
  }

  const body = (await response.json()) as VerifyResponse;
  if (!body.tokenValid || !body.userId || !body.tenantId) {
    throw new McpAuthError('VERIFY_FAILED', 'Verify endpoint returned invalid payload');
  }
  return body;
}

export async function resolveSessionFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  fetchImpl: FetchFn = fetch,
): Promise<{ session: McpSessionContext; apiBase: string; token: string }> {
  const resolvedEnv = readEnv(env);
  const verify = await verifyToken(resolvedEnv, fetchImpl);

  const session: McpSessionContext = {
    userId: verify.userId,
    tenantId: verify.tenantId,
    userName: verify.userName ?? 'fmx user',
    userEmail: verify.userEmail ?? '',
    roles: verify.roles,
  };

  return { session, apiBase: resolvedEnv.apiBase, token: resolvedEnv.token };
}
