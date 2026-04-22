/**
 * MCP Tool: codeengine_query
 * Query platform data via dataEngine.
 * Context (tenant) resolved automatically via session.
 */

import { z } from 'zod';
import type { McpServiceResult } from '../types';

export const TOOL_NAME = 'codeengine_query';

const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({
    eq: z.unknown().optional(),
    neq: z.unknown().optional(),
    gt: z.number().optional(),
    gte: z.number().optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
    like: z.string().optional(),
    in: z.array(z.unknown()).optional(),
    isNull: z.boolean().optional(),
  }),
]);

export const queryInputSchema = {
  object: z.string().describe('Object API name (e.g. "Account")'),
  filters: z.record(z.string(), filterValueSchema).optional().describe('Optional filters'),
  limit: z.number().int().min(1).max(1000).optional().describe('Max records to return (default 100)'),
  offset: z.number().int().min(0).optional().describe('Records to skip for pagination'),
};

export interface QueryOutput {
  records: Record<string, unknown>[];
  hasMore: boolean;
  total?: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/** Dependencies for query tool (injected for testability) */
export interface QueryToolDeps {
  findRecords: (
    object: string,
    tenantId: string,
    filters?: Record<string, unknown>,
    limit?: number,
    offset?: number,
  ) => Promise<McpServiceResult<{ records: Record<string, unknown>[]; total?: number }>>;
}

/** Query tool handler */
export async function handleQuery(
  args: { object: string; filters?: Record<string, unknown>; limit?: number; offset?: number },
  tenantId: string,
  deps: QueryToolDeps,
): Promise<McpServiceResult<QueryOutput>> {
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ?? 0;

  const result = await deps.findRecords(args.object, tenantId, args.filters, limit + 1, offset);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Query failed',
      errorDetails: { code: 'QUERY_FAILED', ...result.errorDetails },
    };
  }

  const records = result.data?.records ?? [];
  const hasMore = records.length > limit;
  const returnRecords = hasMore ? records.slice(0, limit) : records;

  return {
    success: true,
    data: {
      records: returnRecords,
      hasMore,
      total: result.data?.total,
    },
  };
}
