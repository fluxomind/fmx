/**
 * MCP Tool: codeengine_logs
 * Access extension logs via Foundation Libraries → monitoringEngine.
 */

import { z } from 'zod';
import type { McpServiceResult } from '../types';

export const TOOL_NAME = 'codeengine_logs';

export const logsInputSchema = {
  extensionId: z.string().describe('Extension identifier'),
  since: z.string().optional().describe('ISO 8601 timestamp to filter from'),
  limit: z.number().int().min(1).max(500).optional().describe('Max entries to return (default 100)'),
};

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface LogsOutput {
  entries: LogEntry[];
}

/** Dependencies for logs tool (injected for testability) */
export interface LogsToolDeps {
  getExtensionLogs: (
    extensionId: string,
    tenantId: string,
    since?: string,
    limit?: number,
  ) => Promise<McpServiceResult<LogsOutput>>;
}

/** Logs tool handler */
export async function handleLogs(
  args: { extensionId: string; since?: string; limit?: number },
  tenantId: string,
  deps: LogsToolDeps,
): Promise<McpServiceResult<LogsOutput>> {
  const limit = Math.min(args.limit ?? 100, 500);

  const result = await deps.getExtensionLogs(args.extensionId, tenantId, args.since, limit);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Failed to retrieve logs',
      errorDetails: { code: 'LOGS_FAILED', ...result.errorDetails },
    };
  }

  return { success: true, data: result.data ?? { entries: [] } };
}
