/**
 * MCP Tool: codeengine_scaffold
 * Scaffold extension/module project via Foundation Libraries.
 */

import { z } from 'zod';
import type { McpServiceResult } from '../types';

export const TOOL_NAME = 'codeengine_scaffold';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

export const scaffoldInputSchema = {
  name: z.string().describe('Project name (kebab-case, 3-64 chars)'),
  type: z.enum(['extension', 'module']).describe('Project type'),
};

export interface ScaffoldOutput {
  path: string;
  files: string[];
}

/** Dependencies for scaffold tool (injected for testability) */
export interface ScaffoldToolDeps {
  createProject: (name: string, type: 'extension' | 'module') => Promise<McpServiceResult<ScaffoldOutput>>;
}

/** Scaffold tool handler */
export async function handleScaffold(
  args: { name: string; type: 'extension' | 'module' },
  deps: ScaffoldToolDeps,
): Promise<McpServiceResult<ScaffoldOutput>> {
  if (!NAME_PATTERN.test(args.name)) {
    return {
      success: false,
      error: `Invalid project name '${args.name}'. Must be kebab-case: [a-z0-9][a-z0-9-]{2,63}`,
      errorDetails: { code: 'INVALID_NAME', name: args.name, pattern: NAME_PATTERN.source },
    };
  }

  const result = await deps.createProject(args.name, args.type);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Scaffold failed',
      errorDetails: { code: 'SCAFFOLD_FAILED', ...result.errorDetails },
    };
  }

  return { success: true, data: result.data };
}
