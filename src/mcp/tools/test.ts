/**
 * MCP Tool: codeengine_test
 * Execute extension tests in Deno V8 sandbox.
 * Adapter MCP → Foundation Libraries de test.
 */

import { z } from 'zod';
import type { McpServiceResult } from '../types';

export const TOOL_NAME = 'codeengine_test';

export const testInputSchema = {
  extensionPath: z.string().describe('Path to the extension project directory'),
  filter: z.string().optional().describe('Optional test name filter'),
};

export interface TestOutput {
  passed: number;
  failed: number;
  output: string;
}

/** Dependencies for test tool (injected for testability) */
export interface TestToolDeps {
  runTests: (extensionPath: string, filter?: string) => Promise<McpServiceResult<TestOutput>>;
}

/** Test tool handler */
export async function handleTest(
  args: { extensionPath: string; filter?: string },
  deps: TestToolDeps,
): Promise<McpServiceResult<TestOutput>> {
  const result = await deps.runTests(args.extensionPath, args.filter);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Test execution failed',
      errorDetails: { code: 'TEST_FAILED', ...result.errorDetails },
    };
  }

  return { success: true, data: result.data };
}
