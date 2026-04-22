/**
 * Token refresh closure — invoked by http-client on 401.
 *
 * Soft-dependent on GAP-179 (`POST /api/v1/auth/refresh`). If the endpoint
 * returns 404 (not yet shipped) or 401 (token expired beyond recovery),
 * this throws and bin.ts exits 1 with a clear message.
 *
 * @package @/engine/codeEngine/mcp
 */

export class McpRefreshError extends Error {
  readonly code: 'NOT_SUPPORTED' | 'REFRESH_FAILED' | 'NETWORK_ERROR';
  readonly statusCode?: number;

  constructor(code: 'NOT_SUPPORTED' | 'REFRESH_FAILED' | 'NETWORK_ERROR', message: string, statusCode?: number) {
    super(message);
    this.name = 'McpRefreshError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface CreateRefreshFnOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Returns a function compatible with HttpClient's `onRefresh` hook.
 * Closure over `baseUrl` + `fetchImpl`. Does NOT memoize the token — the
 * http-client updates its own `currentToken` from the returned value.
 */
export function createRefreshFn(
  opts: CreateRefreshFnOptions,
): (currentToken: string) => Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/v1/auth/refresh`;

  return async function refresh(currentToken: string): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${currentToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ token: currentToken }),
      });
    } catch (err) {
      throw new McpRefreshError(
        'NETWORK_ERROR',
        `Failed to reach refresh endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (response.status === 404) {
      throw new McpRefreshError(
        'NOT_SUPPORTED',
        'Refresh endpoint not available (GAP-179 pending). Re-authenticate with `fmx auth login`.',
        404,
      );
    }

    if (!response.ok) {
      throw new McpRefreshError(
        'REFRESH_FAILED',
        `Token refresh failed (HTTP ${response.status}). Re-authenticate with \`fmx auth login\`.`,
        response.status,
      );
    }

    const body = (await response.json()) as { token?: string; accessToken?: string };
    const newToken = body.token ?? body.accessToken;
    if (!newToken || typeof newToken !== 'string') {
      throw new McpRefreshError('REFRESH_FAILED', 'Refresh endpoint returned no token');
    }
    return newToken;
  };
}
