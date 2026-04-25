/**
 * API Client — HTTP client with auth token injection, silent refresh, error classification.
 * @package @fluxomind/cli
 */

import { loadConfig, resolveApiUrl } from './config-manager';
import { getAuthToken, getStoredTenants, getTenantAuth } from './auth-manager';
import { refreshIfExpired, forceRefresh } from './auth-refresh';
import { randomUUID } from 'crypto';

export class AuthError extends Error {
  constructor(message: string) {
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
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ServerError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  tenant?: string;
}

const DEFAULT_TIMEOUT = 30_000;
const DEPLOY_TIMEOUT = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function resolveTargetTenant(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const config = loadConfig();
  if (config.defaultTenant) return config.defaultTenant;
  const [first] = getStoredTenants();
  return first;
}

export async function apiRequest<T = unknown>(options: RequestOptions): Promise<T> {
  const targetTenant = resolveTargetTenant(options.tenant);

  if (targetTenant) {
    await refreshIfExpired(targetTenant);
  }

  const url = `${resolveApiUrl()}${options.path}`;
  const timeout = options.timeout ?? (options.path.includes('deploy') ? DEPLOY_TIMEOUT : DEFAULT_TIMEOUT);

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
      ...options.headers,
    };
    const token = targetTenant ? getTenantAuth(targetTenant)?.accessToken ?? null : getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  async function execute(headers: Record<string, string>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  let lastError: Error | null = null;
  let refreshAttempted = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers = buildHeaders();
      const response = await execute(headers);

      if (response.status === 401) {
        if (!refreshAttempted && targetTenant) {
          refreshAttempted = true;
          const outcome = await forceRefresh(targetTenant);
          if (outcome.refreshed) {
            continue;
          }
        }
        throw new AuthError('Session expired. Run: fmx auth login');
      }

      if (response.status === 403) {
        throw new AuthError('Permission denied. Check your tenant configuration.');
      }

      if (response.status === 422) {
        const data = await response.json().catch(() => ({}));
        throw new ValidationError('Validation failed', data);
      }

      if (response.status >= 500) {
        throw new ServerError(`Server error (${response.status})`, response.status);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ServerError(text || `HTTP ${response.status}`, response.status);
      }

      return (await response.json()) as T;
    } catch (err) {
      lastError = err as Error;

      if (err instanceof AuthError || err instanceof ValidationError) {
        throw err;
      }

      if (attempt < MAX_RETRIES) {
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
