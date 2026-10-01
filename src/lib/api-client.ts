/**
 * API Client — HTTP client with auth token injection, silent refresh, error classification.
 * @package @fluxomind/cli
 */

import { loadConfig, resolveApiUrl } from './config-manager';
import { getAuthToken, getStoredTenants, getTenantAuth } from './auth-manager';
import { refreshIfExpired, forceRefresh } from './auth-refresh';
import { isDryRun, DryRunPreview } from './dry-run';
import { projectContext } from './project-context';
import { randomUUID } from 'crypto';
import { isReadOnly, ReadOnlyError } from './request-policy';

export class AuthError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: unknown,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ServerError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  tenant?: string;
  retries?: number;
}

const DEFAULT_TIMEOUT = 30_000;
const DEPLOY_TIMEOUT = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export function resolveTargetTenant(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const project = projectContext();
  if (project) return project.tenant;
  const config = loadConfig();
  if (config.defaultTenant) return config.defaultTenant;
  const [first] = getStoredTenants();
  return first;
}

export async function apiRequest<T = unknown>(options: RequestOptions): Promise<T> {
  if (isDryRun() && options.method !== 'GET') throw new DryRunPreview(options.method, options.path, options.body);
  if (isReadOnly() && options.method !== 'GET') throw new ReadOnlyError();
  const envToken = process.env.FLUXOMIND_ACCESS_TOKEN;
  const targetTenant = envToken ? undefined : resolveTargetTenant(options.tenant);

  if (targetTenant) {
    await refreshIfExpired(targetTenant);
  }

  const url = `${resolveApiUrl()}${options.path}`;
  const timeout = options.timeout ?? (options.path.includes('deploy') ? DEPLOY_TIMEOUT : DEFAULT_TIMEOUT);

  const idempotencyKey = randomUUID();
  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'x-correlation-id': idempotencyKey,
      'x-request-id': idempotencyKey,
      ...options.headers,
    };
    const token = envToken ?? (targetTenant ? getTenantAuth(targetTenant)?.accessToken ?? null : getAuthToken());
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  async function execute(headers: Record<string, string>): Promise<Response> {
    return await fetch(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      // Keep the deadline active while the response body is being read too.
      signal: AbortSignal.timeout(timeout),
    });
  }

  let lastError: Error | null = null;
  let refreshAttempted = false;

  for (let attempt = 0; attempt <= (options.retries ?? MAX_RETRIES); attempt++) {
    try {
      const headers = buildHeaders();
      const response = await execute(headers);

      if (response.status === 401) {
        if (!refreshAttempted && targetTenant) {
          refreshAttempted = true;
          const outcome = await forceRefresh(targetTenant);
          if (outcome.refreshed) {
            attempt--; // Renewing rejected credentials does not consume the transient retry budget.
            continue;
          }
        }
        throw new AuthError('Session expired. Run: fmx auth login', 401);
      }

      if (response.status === 403) {
        throw new AuthError('Permission denied. Check your tenant configuration.', 403);
      }

      if (response.status === 422) {
        const data = await response.json().catch(() => ({}));
        throw new ValidationError('Validation failed', data, 422);
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        const envelope = payload?.error;
        const objectError = envelope && typeof envelope === 'object' ? envelope as Record<string, unknown> : undefined;
        const message = typeof payload?.message === 'string' ? payload.message : typeof objectError?.message === 'string' ? objectError.message : typeof envelope === 'string' ? envelope : `HTTP ${response.status}`;
        const code = typeof objectError?.code === 'string' ? objectError.code : typeof payload?.errorCode === 'string' ? payload.errorCode : undefined;
        throw new ServerError(message.slice(0, 2000), response.status, code, payload?.conflict ?? objectError?.details ?? payload?.details);
      }

      if (response.status === 204 || response.status === 205) return undefined as T;
      try { return (await response.json()) as T; }
      catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) throw err;
        throw Object.assign(new ValidationError('Platform returned an invalid JSON response. The request will not be repeated.'), { code: 'INVALID_RESPONSE' });
      }
    } catch (err) {
      lastError = err as Error;
      if (lastError.name === 'AbortError' || lastError.name === 'TimeoutError') lastError = new NetworkError(`Request timed out after ${timeout}ms`);
      Object.assign(lastError, { requestId: idempotencyKey });

      if (err instanceof AuthError || err instanceof ValidationError || (err instanceof ServerError && err.statusCode < 500)) {
        throw err;
      }

      if (options.method !== 'GET') throw lastError;
      if (attempt < (options.retries ?? MAX_RETRIES)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new NetworkError(`Request timed out after ${timeout}ms`);
  }

  throw lastError ?? new NetworkError('Request failed');
}

export async function get<T = unknown>(path: string, tenant?: string): Promise<T> {
  return apiRequest<T>({ method: 'GET', path, tenant });
}

export async function post<T = unknown>(path: string, body?: unknown, tenant?: string): Promise<T> {
  return apiRequest<T>({ method: 'POST', path, body, tenant });
}

export async function del<T = unknown>(path: string, tenant?: string): Promise<T> {
  return apiRequest<T>({ method: 'DELETE', path, tenant });
}
