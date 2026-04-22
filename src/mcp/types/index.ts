/**
 * MCP Server types for the codeEngine.
 * Shared types for tool input/output schemas and server configuration.
 */

/** Resolved session context from authentication */
export interface McpSessionContext {
  userId: string;
  tenantId: string;
  userName: string;
  userEmail: string;
  roles: string[];
}

/** Role required to call each tool */
export type McpToolRole = 'admin' | 'developer' | 'viewer';

/** Tool authorization map */
export const TOOL_ROLE_REQUIREMENTS: Record<string, McpToolRole> = {
  'codeengine_deploy': 'admin',
  'codeengine_test': 'developer',
  'codeengine_query': 'viewer',
  'codeengine_scaffold': 'developer',
  'codeengine_logs': 'viewer',
  'codeengine_metadata': 'viewer',
};

/** Role hierarchy: admin > developer > viewer */
const ROLE_HIERARCHY: Record<McpToolRole, number> = {
  admin: 3,
  developer: 2,
  viewer: 1,
};

/** Check if a user role satisfies the required role */
export function hasRequiredRole(userRoles: string[], requiredRole: McpToolRole): boolean {
  const requiredLevel = ROLE_HIERARCHY[requiredRole];
  return userRoles.some((role) => {
    const level = ROLE_HIERARCHY[role as McpToolRole];
    return level !== undefined && level >= requiredLevel;
  });
}

/** Rate limit configuration per tool */
export interface RateLimitConfig {
  maxCalls: number;
  windowMs: number;
}

/** Default rate limits per tool (overridable via env) */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'codeengine_deploy': { maxCalls: 10, windowMs: 60 * 60 * 1000 },    // 10/hour
  'codeengine_test': { maxCalls: 30, windowMs: 60 * 60 * 1000 },      // 30/hour
  'codeengine_query': { maxCalls: 100, windowMs: 60 * 1000 },          // 100/min
  'codeengine_scaffold': { maxCalls: 20, windowMs: 60 * 60 * 1000 },   // 20/hour
  'codeengine_logs': { maxCalls: 60, windowMs: 60 * 1000 },            // 60/min
  'codeengine_metadata': { maxCalls: 60, windowMs: 60 * 1000 },        // 60/min
};

/** Filter value type for query tool */
export type FilterValue =
  | string
  | number
  | boolean
  | {
      eq?: unknown;
      neq?: unknown;
      gt?: number;
      gte?: number;
      lt?: number;
      lte?: number;
      like?: string;
      in?: unknown[];
      isNull?: boolean;
    };

/**
 * Local definition of ServiceResult for MCP handlers.
 * Mirrors the platform shape (see @/engine/dataEngine in the monorepo) but kept
 * standalone so this package does not depend on monorepo aliases.
 */
export interface McpServiceResult<T = Record<string, unknown>, E = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: E;
}
