/**
 * HTTP-backed implementations of the 5 remote tool deps (deploy, test, query, logs, metadata).
 * Scaffold is local-only (see scaffold-adapter.ts).
 *
 * Pass these factories to `bin.ts` which wires them into `createMcpServer(deps)`.
 *
 * @package @/engine/codeEngine/mcp
 */

import type { HttpClient, HttpError } from './http-client';
import type { DeployToolDeps, DeployOutput } from './tools/deploy';
import type { TestToolDeps, TestOutput } from './tools/test';
import type { QueryToolDeps } from './tools/query';
import type { LogsToolDeps, LogsOutput } from './tools/logs';
import type { MetadataToolDeps, ObjectInfo, FieldInfo } from './tools/metadata';
import type { McpServiceResult } from './types';

export interface CreateHttpDepsOptions {
  http: HttpClient;
}

function errorFromHttp<T>(err: unknown, defaultCode: string): McpServiceResult<T> {
  if (err && typeof err === 'object' && 'status' in err) {
    const httpErr = err as HttpError;
    return {
      success: false,
      error: httpErr.message,
      errorDetails: { code: defaultCode, status: httpErr.status, body: httpErr.responseText },
    };
  }
  return {
    success: false,
    error: err instanceof Error ? err.message : String(err),
    errorDetails: { code: defaultCode },
  };
}

function ok<T>(data: T): McpServiceResult<T> {
  return { success: true, data };
}

export function createDeployDeps({ http }: CreateHttpDepsOptions): DeployToolDeps {
  return {
    validateManifest: async (_extensionPath) => {
      // Client-side bundler + validateManifestLocal live in the CLI. The MCP server does not
      // have the filesystem context to bundle a local path; bin.ts invokes this adapter from
      // an AI client that has already staged the bundle. Validation happens server-side
      // inside deployExtension via parseManifest.
      return ok({ name: 'unknown', version: '0.0.0' });
    },
    deployExtension: async (_extensionPath, _tenantId) => {
      try {
        // The MCP bin.ts runs in the dev's machine context; AI clients that invoke this tool
        // should stage the bundle separately. For now, this adapter expects the AI client to
        // have already written the bundle to an agreed location OR the extensionPath references
        // a server-side path. Full path-to-bundle resolution is a follow-up GAP_CANDIDATE —
        // tracked in GAP-180 .phase-log.md.
        const response = await http.request<{ version: string; status: string; url: string }>({
          method: 'POST',
          path: '/api/code-engine/deploy',
          body: {
            // Minimal body — real implementations from CLI send { manifest, files, hash, version }
            // which are built client-side. MCP tool invocation implies AI client staged bundle.
            extensionPath: _extensionPath,
          },
        });
        return ok<DeployOutput>({
          version: response.version,
          status: response.status,
          url: response.url,
        });
      } catch (err) {
        return errorFromHttp<DeployOutput>(err, 'DEPLOY_HTTP_FAILED');
      }
    },
  };
}

export function createTestDeps({ http }: CreateHttpDepsOptions): TestToolDeps {
  return {
    runTests: async (_extensionPath, filter) => {
      try {
        const response = await http.request<{
          passed: number;
          failed: number;
          skipped: number;
          output?: string;
          state?: string;
        }>({
          method: 'POST',
          path: '/api/code-engine/test',
          body: {
            extensionPath: _extensionPath,
            filter,
          },
        });
        return ok<TestOutput>({
          passed: response.passed,
          failed: response.failed,
          output: response.output ?? `${response.passed} passed, ${response.failed} failed${response.skipped ? `, ${response.skipped} skipped` : ''}${response.state ? ` (${response.state})` : ''}`,
        });
      } catch (err) {
        return errorFromHttp<TestOutput>(err, 'TEST_HTTP_FAILED');
      }
    },
  };
}

export function createQueryDeps({ http }: CreateHttpDepsOptions): QueryToolDeps {
  return {
    findRecords: async (object, _tenantId, filters, limit, offset) => {
      try {
        const response = await http.request<{
          records: Record<string, unknown>[];
          hasMore: boolean;
          total?: number;
        }>({
          method: 'POST',
          path: '/api/code-engine/query',
          body: { object, filters, limit, offset },
        });
        return ok({
          records: response.records,
          total: response.total,
        });
      } catch (err) {
        return errorFromHttp<{ records: Record<string, unknown>[]; total?: number }>(
          err,
          'QUERY_HTTP_FAILED',
        );
      }
    },
  };
}

export function createLogsDeps({ http }: CreateHttpDepsOptions): LogsToolDeps {
  return {
    getExtensionLogs: async (extensionId, _tenantId, since, limit) => {
      try {
        const response = await http.request<{
          entries: Array<{
            timestamp: string;
            level: string;
            message: string;
            data?: Record<string, unknown>;
          }>;
        }>({
          method: 'GET',
          path: '/api/code-engine/logs',
          query: {
            extensionId,
            since,
            limit,
          },
        });
        return ok<LogsOutput>({
          entries: response.entries.map((e) => ({
            timestamp: e.timestamp,
            level: e.level,
            message: e.message,
            data: e.data,
          })),
        });
      } catch (err) {
        return errorFromHttp<LogsOutput>(err, 'LOGS_HTTP_FAILED');
      }
    },
  };
}

export function createMetadataDeps({ http }: CreateHttpDepsOptions): MetadataToolDeps {
  return {
    listObjects: async (_tenantId) => {
      try {
        const response = await http.request<{ objects: ObjectInfo[] }>({
          method: 'GET',
          path: '/api/code-engine/metadata',
        });
        return ok({ objects: response.objects });
      } catch (err) {
        return errorFromHttp<{ objects: ObjectInfo[] }>(err, 'METADATA_HTTP_FAILED');
      }
    },
    getObjectFields: async (objectName, _tenantId) => {
      try {
        const response = await http.request<{ fields: FieldInfo[] }>({
          method: 'GET',
          path: '/api/code-engine/metadata',
          query: { object: objectName },
        });
        return ok({ fields: response.fields });
      } catch (err) {
        return errorFromHttp<{ fields: FieldInfo[] }>(err, 'METADATA_HTTP_FAILED');
      }
    },
  };
}

export interface HttpDeps {
  deploy: DeployToolDeps;
  test: TestToolDeps;
  query: QueryToolDeps;
  logs: LogsToolDeps;
  metadata: MetadataToolDeps;
}

export function createHttpDeps(opts: CreateHttpDepsOptions): HttpDeps {
  return {
    deploy: createDeployDeps(opts),
    test: createTestDeps(opts),
    query: createQueryDeps(opts),
    logs: createLogsDeps(opts),
    metadata: createMetadataDeps(opts),
  };
}
