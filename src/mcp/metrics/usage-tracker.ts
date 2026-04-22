/**
 * MCP Server Usage Tracker.
 * Prometheus metrics per tool: invocations, latency, errors.
 */

import { Counter, Histogram, Registry } from 'prom-client';

export const mcpRegistry = new Registry();

export const mcpToolInvocationsTotal = new Counter({
  name: 'fluxomind_mcp_tool_invocations_total',
  help: 'Total MCP tool invocations by tool and status',
  labelNames: ['tool', 'status', 'user_id'],
  registers: [mcpRegistry],
});

export const mcpToolDurationMs = new Histogram({
  name: 'fluxomind_mcp_tool_duration_ms',
  help: 'MCP tool execution duration in milliseconds',
  labelNames: ['tool', 'user_id'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [mcpRegistry],
});

export const mcpToolErrorsTotal = new Counter({
  name: 'fluxomind_mcp_tool_errors_total',
  help: 'Total MCP tool errors by tool and error code',
  labelNames: ['tool', 'error_code', 'user_id'],
  registers: [mcpRegistry],
});

/** Record a tool invocation metric */
export function observeToolInvocation(
  tool: string,
  status: 'success' | 'error',
  durationMs: number,
  userId: string,
  errorCode?: string,
): void {
  mcpToolInvocationsTotal.inc({ tool, status, user_id: userId });
  mcpToolDurationMs.observe({ tool, user_id: userId }, durationMs);
  if (status === 'error' && errorCode) {
    mcpToolErrorsTotal.inc({ tool, error_code: errorCode, user_id: userId });
  }
}
