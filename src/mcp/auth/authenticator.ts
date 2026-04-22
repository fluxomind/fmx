/**
 * MCP Server Authenticator.
 * Validates tokens and resolves session context (user, tenant).
 * Uses the same mechanism as CLI `fmx auth`.
 */

import type { McpSessionContext, McpServiceResult } from '../types';

/** Dependencies for the authenticator (injected for testability) */
export interface AuthenticatorDeps {
  validateToken: (token: string) => Promise<McpSessionContext | null>;
}

/** Extract bearer token from authorization header */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/** Authenticate an MCP request and return session context */
export async function authenticate(
  token: string | null,
  deps: AuthenticatorDeps,
): Promise<McpServiceResult<McpSessionContext>> {
  if (!token) {
    return {
      success: false,
      error: 'Authentication required',
      errorDetails: { code: 'AUTH_REQUIRED' },
    };
  }

  const context = await deps.validateToken(token);
  if (!context) {
    return {
      success: false,
      error: 'Invalid or expired token',
      errorDetails: { code: 'AUTH_INVALID_TOKEN' },
    };
  }

  return { success: true, data: context };
}
