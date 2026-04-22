/**
 * MCP Tool Registry.
 * Registers all 6 codeEngine tools with the McpServer instance.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { randomUUID } from 'node:crypto';
import type { McpSessionContext, McpServiceResult } from '../types';
import { observeToolInvocation } from '../metrics/usage-tracker';
import { deployInputSchema, handleDeploy, type DeployToolDeps } from './deploy';
import { testInputSchema, handleTest, type TestToolDeps } from './test';
import { queryInputSchema, handleQuery, type QueryToolDeps } from './query';
import { scaffoldInputSchema, handleScaffold, type ScaffoldToolDeps } from './scaffold';
import { logsInputSchema, handleLogs, type LogsToolDeps } from './logs';
import { metadataInputSchema, handleMetadata, type MetadataToolDeps } from './metadata';

/** Result from session resolution — includes error details for rate limit / auth failures */
export interface SessionResolutionResult {
  session: McpSessionContext | null;
  error?: { code: string; message: string; retryAfterSeconds?: number };
}

/** Combined dependencies for all tools */
export interface ToolRegistryDeps {
  deploy: DeployToolDeps;
  test: TestToolDeps;
  query: QueryToolDeps;
  scaffold: ScaffoldToolDeps;
  logs: LogsToolDeps;
  metadata: MetadataToolDeps;
  resolveSession: (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => SessionResolutionResult;
  log: (level: string, message: string, data?: Record<string, unknown>) => void;
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Format a tool result as MCP CallToolResult content */
function toolResult(data: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

/** Execute handler with metrics, logging, and error handling */
async function executeWithObservability<T>(
  toolName: string,
  resolution: SessionResolutionResult,
  deps: ToolRegistryDeps,
  handler: () => Promise<McpServiceResult<T>>,
) {
  const start = Date.now();
  const { session, error: sessionError } = resolution;
  const userId = session?.userId ?? 'unknown';
  const cid = randomUUID();

  deps.log('info', `mcp.${toolName}:attempt`, {
    engine: 'codeEngine',
    op: `mcp.${toolName}`,
    tenantId: session?.tenantId,
    userId,
    cid,
  });

  if (!session) {
    const durationMs = Date.now() - start;
    const errorCode = sessionError?.code ?? 'AUTH_REQUIRED';
    const errorMessage = sessionError?.message ?? 'Authentication required';
    observeToolInvocation(toolName, 'error', durationMs, userId, errorCode);
    const errorPayload: Record<string, unknown> = { error: errorMessage, code: errorCode };
    if (sessionError?.retryAfterSeconds) {
      errorPayload.retryAfterSeconds = sessionError.retryAfterSeconds;
    }
    return toolResult(errorPayload, true);
  }

  try {
    const result = await handler();
    const durationMs = Date.now() - start;

    if (result.success) {
      observeToolInvocation(toolName, 'success', durationMs, userId);
      deps.log('info', `mcp.${toolName}:success`, {
        engine: 'codeEngine',
        op: `mcp.${toolName}`,
        tenantId: session.tenantId,
        userId,
        cid,
        durationMs,
      });
      return toolResult(result.data);
    }

    const errorCode = (result.errorDetails?.code as string) ?? 'UNKNOWN';
    observeToolInvocation(toolName, 'error', durationMs, userId, errorCode);
    deps.log('warn', `mcp.${toolName}:error`, {
      engine: 'codeEngine',
      op: `mcp.${toolName}`,
      tenantId: session.tenantId,
      userId,
      cid,
      error: result.error,
      durationMs,
    });
    return toolResult({ error: result.error, code: errorCode }, true);
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    observeToolInvocation(toolName, 'error', durationMs, userId, 'INTERNAL_ERROR');
    deps.log('error', `mcp.${toolName}:exception`, {
      engine: 'codeEngine',
      op: `mcp.${toolName}`,
      tenantId: session.tenantId,
      userId,
      cid,
      error: message,
      durationMs,
    });
    return toolResult({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, true);
  }
}

/** Register all 6 codeEngine tools with the MCP server */
export function registerAllTools(server: McpServer, deps: ToolRegistryDeps): void {
  server.registerTool(
    'codeengine_deploy',
    {
      title: 'Deploy Extension',
      description: 'Deploy an extension via Direct Deploy (upload). Validates manifest and deploys to sandbox.',
      inputSchema: z.object(deployInputSchema),
    },
    async (args: { extensionPath: string }, extra: Extra) => {
      const resolution = deps.resolveSession(extra);
      return executeWithObservability('codeengine_deploy', resolution, deps, () =>
        handleDeploy(args, resolution.session!.tenantId, deps.deploy, resolution.session!.userId),
      );
    },
  );

  server.registerTool(
    'codeengine_test',
    {
      title: 'Run Extension Tests',
      description: 'Execute tests for an extension in the Deno V8 sandbox (same runtime as production).',
      inputSchema: z.object(testInputSchema),
    },
    async (args: { extensionPath: string; filter?: string }, extra: Extra) => {
      const resolution = deps.resolveSession(extra);
      return executeWithObservability('codeengine_test', resolution, deps, () =>
        handleTest(args, deps.test),
      );
    },
  );

  server.registerTool(
    'codeengine_query',
    {
      title: 'Query Platform Data',
      description: 'Query records from a platform object via dataEngine. Tenant resolved automatically.',
      inputSchema: z.object(queryInputSchema),
    },
    async (args: { object: string; filters?: Record<string, unknown>; limit?: number; offset?: number }, extra: Extra) => {
      const resolution = deps.resolveSession(extra);
      return executeWithObservability('codeengine_query', resolution, deps, () =>
        handleQuery(args, resolution.session!.tenantId, deps.query),
      );
    },
  );

  server.registerTool(
    'codeengine_scaffold',
    {
      title: 'Scaffold Extension Project',
      description: 'Create a new extension or module project with manifest, SDK types, and structure.',
      inputSchema: z.object(scaffoldInputSchema),
    },
    async (args: { name: string; type: 'extension' | 'module' }, extra: Extra) => {
      const resolution = deps.resolveSession(extra);
      return executeWithObservability('codeengine_scaffold', resolution, deps, () =>
        handleScaffold(args, deps.scaffold),
      );
    },
  );

  server.registerTool(
    'codeengine_logs',
    {
      title: 'View Extension Logs',
      description: 'Access extension execution logs with optional time and count filters.',
      inputSchema: z.object(logsInputSchema),
    },
    async (args: { extensionId: string; since?: string; limit?: number }, extra: Extra) => {
      const resolution = deps.resolveSession(extra);
      return executeWithObservability('codeengine_logs', resolution, deps, () =>
        handleLogs(args, resolution.session!.tenantId, deps.logs),
      );
    },
  );

  server.registerTool(
    'codeengine_metadata',
    {
      title: 'View Platform Metadata',
      description: 'List objects or view fields of a specific object. Omit "object" to list all.',
      inputSchema: z.object(metadataInputSchema),
    },
    async (args: { object?: string }, extra: Extra) => {
      const resolution = deps.resolveSession(extra);
      return executeWithObservability('codeengine_metadata', resolution, deps, () =>
        handleMetadata(args, resolution.session!.tenantId, deps.metadata),
      );
    },
  );
}
