/**
 * MCP Server Authorizer.
 * Granular role-based authorization per tool.
 */

import type { McpSessionContext, McpServiceResult } from '../types';
import { TOOL_ROLE_REQUIREMENTS, hasRequiredRole } from '../types';

/** Authorize a tool call for the given session context */
export function authorize(
  toolName: string,
  context: McpSessionContext,
): McpServiceResult<void> {
  const requiredRole = TOOL_ROLE_REQUIREMENTS[toolName];
  if (!requiredRole) {
    return {
      success: false,
      error: `Tool '${toolName}' not found`,
      errorDetails: { code: 'TOOL_NOT_FOUND', toolName },
    };
  }

  if (!hasRequiredRole(context.roles, requiredRole)) {
    return {
      success: false,
      error: `Insufficient permissions for tool '${toolName}'. Required role: ${requiredRole}`,
      errorDetails: { code: 'AUTH_FORBIDDEN', toolName, requiredRole, userRoles: context.roles },
    };
  }

  return { success: true };
}
