#!/usr/bin/env node
/**
 * Standalone entry point for the codeEngine MCP Server (stdio transport).
 *
 * Invocation (canonical, post-EVO-394):
 *   fmx mcp serve
 *
 * Legacy alias (deprecated, until v2.0.0):
 *   fmx mcp --local
 *
 * Both paths spawn:
 *   node dist/mcp/bin.js
 * with env vars injected by the CLI:
 *   FLUXOMIND_MCP_AUTH_TOKEN    — session token from ~/.fmx/config.json
 *   FLUXOMIND_MCP_TENANT        — active tenant id
 *   FLUXOMIND_MCP_API_BASE      — platform API URL (default: https://platform.fluxomind.com)
 *
 * All output to stderr; stdout is reserved for the MCP stdio protocol.
 *
 * @package @/engine/codeEngine/mcp
 */

import { createMcpServer } from './server';
import type { SessionResolutionResult } from './tools/registry';
import { resolveSessionFromEnv, McpAuthError } from './session-resolver';
import { createHttpClient } from './http-client';
import { createRefreshFn, McpRefreshError } from './token-refresh';
import { createHttpDeps } from './http-deps';
import { createScaffoldDeps } from './scaffold-adapter';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, op: string, data?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    engine: 'codeEngine',
    op,
    ...data,
  };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

async function main(): Promise<void> {
  // 1. Resolve session from env vars + verify endpoint
  let resolved;
  try {
    resolved = await resolveSessionFromEnv();
  } catch (err) {
    if (err instanceof McpAuthError) {
      log('error', 'mcp.bin:auth-failed', { code: err.code, message: err.message, statusCode: err.statusCode });
      process.stderr.write(`\nMCP startup failed: ${err.message}\n`);
    } else {
      log('error', 'mcp.bin:auth-unexpected', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.stderr.write(`\nMCP startup failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(1);
  }

  const { session, apiBase, token } = resolved;

  log('info', 'mcp.bin:session-resolved', {
    userId: session.userId,
    tenantId: session.tenantId,
    userEmail: session.userEmail,
    apiBase,
    rolesCount: session.roles.length,
  });

  // 2. HTTP client with refresh (soft dep on GAP-179)
  const refresh = createRefreshFn({ baseUrl: apiBase });
  const http = createHttpClient({
    baseUrl: apiBase,
    token,
    onRefresh: async (current) => {
      try {
        return await refresh(current);
      } catch (refreshErr) {
        if (refreshErr instanceof McpRefreshError) {
          log('error', 'mcp.bin:refresh-failed', { code: refreshErr.code, statusCode: refreshErr.statusCode });
        }
        throw refreshErr;
      }
    },
    log,
  });

  // 3. Build tool deps — HTTP-backed for 5 remote tools, local for scaffold
  const httpDeps = createHttpDeps({ http });
  const scaffoldDeps = createScaffoldDeps();

  // 4. Session resolver for per-request MCP calls
  const resolveSession = (): SessionResolutionResult => ({ session });

  // 5. Create MCP server
  const server = createMcpServer({
    deploy: httpDeps.deploy,
    test: httpDeps.test,
    query: httpDeps.query,
    scaffold: scaffoldDeps,
    logs: httpDeps.logs,
    metadata: httpDeps.metadata,
    resolveSession,
    log: (level, msg, data) => log(level as LogLevel, msg, data),
  });

  // 6. Graceful shutdown on SIGINT/SIGTERM
  const shutdown = async (signal: string) => {
    log('info', 'mcp.bin:shutdown', { signal });
    try {
      await server.stop();
    } catch (stopErr) {
      log('error', 'mcp.bin:stop-failed', { error: stopErr instanceof Error ? stopErr.message : String(stopErr) });
    }
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 7. Start stdio transport
  try {
    await server.start();
    log('info', 'mcp.bin:started', {
      tenantId: session.tenantId,
      userEmail: session.userEmail,
    });
  } catch (startErr) {
    log('error', 'mcp.bin:start-failed', {
      error: startErr instanceof Error ? startErr.message : String(startErr),
    });
    process.stderr.write(
      `\nMCP server failed to start: ${startErr instanceof Error ? startErr.message : String(startErr)}\n`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`\nUnhandled error in MCP bin: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
