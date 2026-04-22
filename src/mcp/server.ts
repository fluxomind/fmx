/**
 * MCP Server for codeEngine.
 * Exposes 6 tools via Model Context Protocol for AI agents.
 *
 * Transports: StdioServerTransport (for Claude Desktop, Cursor, VS Code)
 *
 * Usage:
 *   const server = createMcpServer(deps);
 *   await server.start(); // starts stdio transport
 *   // ... graceful shutdown via server.stop()
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerAllTools, type ToolRegistryDeps, type SessionResolutionResult } from './tools/registry';
import { RateLimiter } from './auth/rate-limiter';
import { authorize } from './auth/authorizer';
import type { McpSessionContext } from './types';

export interface McpServerDeps extends ToolRegistryDeps {
  rateLimiter?: RateLimiter;
}

export type { SessionResolutionResult };

export interface CodeEngineMcpServer {
  mcpServer: McpServer;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** Create and configure the codeEngine MCP Server */
export function createMcpServer(deps: McpServerDeps): CodeEngineMcpServer {
  const mcpServer = new McpServer(
    {
      name: 'codeengine-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  // Register all 6 tools
  registerAllTools(mcpServer, deps);

  const startedAt = Date.now();
  let transport: StdioServerTransport | null = null;
  let shuttingDown = false;

  // Register health check as an MCP resource
  mcpServer.registerResource(
    'health',
    'codeengine://health',
    { description: 'Health check for codeEngine MCP Server' },
    () => {
      const uptimeMs = Date.now() - startedAt;
      const status = shuttingDown ? 'unhealthy' : 'healthy';
      return {
        contents: [{
          uri: 'codeengine://health',
          text: JSON.stringify({ status, uptime: uptimeMs, version: '1.0.0' }),
          mimeType: 'application/json',
        }],
      };
    },
  );

  async function start(): Promise<void> {
    transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    deps.log('info', 'mcp.server:started', {
      engine: 'codeEngine',
      op: 'mcp.server',
      tools: [
        'codeengine_deploy',
        'codeengine_test',
        'codeengine_query',
        'codeengine_scaffold',
        'codeengine_logs',
        'codeengine_metadata',
      ],
    });
  }

  async function stop(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    deps.log('info', 'mcp.server:stopping', {
      engine: 'codeEngine',
      op: 'mcp.server',
    });
    await mcpServer.close();
    deps.log('info', 'mcp.server:stopped', {
      engine: 'codeEngine',
      op: 'mcp.server',
    });
  }

  // Graceful shutdown on SIGTERM/SIGINT
  const onSignal = () => { void stop(); };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  return { mcpServer, start, stop };
}

/** Utility: create a session resolver that checks auth + authz + rate limit */
export function createSessionResolver(deps: {
  rateLimiter: RateLimiter;
  sessionStore: Map<string, McpSessionContext>;
  log: (level: string, message: string, data?: Record<string, unknown>) => void;
}) {
  return (toolName: string, sessionId: string | undefined): SessionResolutionResult => {
    if (!sessionId) return { session: null, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } };

    const session = deps.sessionStore.get(sessionId);
    if (!session) return { session: null, error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid or expired session' } };

    // Authorize
    const authzResult = authorize(toolName, session);
    if (!authzResult.success) {
      deps.log('warn', `mcp.authz:denied`, {
        engine: 'codeEngine',
        op: `mcp.${toolName}`,
        userId: session.userId,
        tenantId: session.tenantId,
        error: authzResult.error,
      });
      return { session: null, error: { code: 'AUTH_FORBIDDEN', message: authzResult.error ?? 'Forbidden' } };
    }

    // Rate limit
    const rateResult = deps.rateLimiter.check(toolName, session.userId);
    if (!rateResult.success) {
      const retryAfterSeconds = (rateResult.errorDetails?.retryAfterSeconds as number) ?? undefined;
      deps.log('warn', `mcp.rateLimit:exceeded`, {
        engine: 'codeEngine',
        op: `mcp.${toolName}`,
        userId: session.userId,
        tenantId: session.tenantId,
        error: rateResult.error,
        retryAfterSeconds,
      });
      return {
        session: null,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: rateResult.error ?? 'Rate limit exceeded', retryAfterSeconds },
      };
    }

    return { session };
  };
}
