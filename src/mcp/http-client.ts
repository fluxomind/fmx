/**
 * HTTP client for MCP bin.ts — injects Bearer token, retries on 5xx, refreshes on 401.
 *
 * Stdio-safe: does NOT write to stdout (reserved for MCP protocol). All logs to stderr.
 *
 * @package @/engine/codeEngine/mcp
 */

export const HEADER_SOURCE = 'x-fmd-source';
export const SOURCE_MCP_LOCAL = 'mcp_local';

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string; // path only, e.g. /api/code-engine/deploy
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export interface HttpClient {
  request<T = unknown>(opts: HttpRequestOptions): Promise<T>;
  getToken(): string;
}

export interface CreateHttpClientOptions {
  baseUrl: string;
  token: string;
  /** Invoked on 401 — expected to return a new token or throw. */
  onRefresh?: (currentToken: string) => Promise<string>;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Log function (writes to stderr only). */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, data?: Record<string, unknown>) => void;
}

const DEFAULT_RETRY_5XX = 3;
const DEFAULT_BACKOFF_MS = [200, 500, 1000];

export class HttpError extends Error {
  readonly status: number;
  readonly responseText: string;

  constructor(status: number, responseText: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.responseText = responseText;
  }
}

export function maskToken(token: string | undefined): string {
  if (!token || token.length < 8) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function createHttpClient(opts: CreateHttpClientOptions): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.log ?? (() => {});
  let currentToken = opts.token;

  async function singleRequest<T>(options: HttpRequestOptions, token: string): Promise<T> {
    const url = buildUrl(opts.baseUrl, options);
    const init: RequestInit = {
      method: options.method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        [HEADER_SOURCE]: SOURCE_MCP_LOCAL,
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    log('debug', 'mcp.http:request', {
      method: options.method,
      path: options.path,
      tokenMasked: maskToken(token),
    });

    const response = await fetchImpl(url, init);

    if (response.status >= 200 && response.status < 300) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    throw new HttpError(response.status, text, `HTTP ${response.status} ${options.method} ${options.path}`);
  }

  async function request<T>(options: HttpRequestOptions): Promise<T> {
    // Attempt 1 — with current token
    try {
      return await singleRequest<T>(options, currentToken);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;

      // 401 → refresh + retry once
      if (err.status === 401 && opts.onRefresh) {
        log('warn', 'mcp.http:401-refreshing', { path: options.path });
        try {
          currentToken = await opts.onRefresh(currentToken);
        } catch (refreshErr) {
          log('error', 'mcp.http:refresh-failed', {
            error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
          });
          throw err;
        }
        return await singleRequest<T>(options, currentToken);
      }

      // 5xx → retry with backoff
      if (err.status >= 500 && err.status < 600) {
        for (let attempt = 0; attempt < DEFAULT_RETRY_5XX; attempt++) {
          const delay = DEFAULT_BACKOFF_MS[attempt] ?? DEFAULT_BACKOFF_MS[DEFAULT_BACKOFF_MS.length - 1];
          await sleep(delay);
          log('warn', 'mcp.http:retry-5xx', { path: options.path, attempt: attempt + 1, status: err.status });
          try {
            return await singleRequest<T>(options, currentToken);
          } catch (retryErr) {
            if (!(retryErr instanceof HttpError) || retryErr.status < 500) throw retryErr;
          }
        }
      }

      throw err;
    }
  }

  return {
    request,
    getToken: () => currentToken,
  };
}

function buildUrl(baseUrl: string, options: HttpRequestOptions): string {
  const base = baseUrl.replace(/\/$/, '');
  const url = new URL(`${base}${options.path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
