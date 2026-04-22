/**
 * Scaffold adapter — MCP tool `codeengine_scaffold` runs LOCALLY on the dev's filesystem.
 * No HTTP call — delegates to the canonical CLI helper `src/lib/scaffold.ts`.
 *
 * Post-EVO-394: MCP server now lives in this repo (@fluxomind/cli), so the adapter
 * imports `createProject` directly from the CLI helper. No more template duplication.
 *
 * @package @fluxomind/cli/mcp
 */

import { createProject, ScaffoldError } from '../lib/scaffold';
import type { ScaffoldToolDeps, ScaffoldOutput } from './tools/scaffold';
import type { McpServiceResult } from './types';

export interface CreateScaffoldDepsOptions {
  /** Base directory where project will be created (default: process.cwd()). */
  targetDir?: string;
}

export function createScaffoldDeps(opts: CreateScaffoldDepsOptions = {}): ScaffoldToolDeps {
  const baseDir = opts.targetDir ?? process.cwd();

  return {
    createProject: async (name, type): Promise<McpServiceResult<ScaffoldOutput>> => {
      try {
        const result = createProject({
          name,
          type: type === 'module' ? 'module' : 'extension',
          targetDir: baseDir,
        });
        return {
          success: true,
          data: { path: result.path, files: result.files },
        };
      } catch (err) {
        if (err instanceof ScaffoldError) {
          return {
            success: false,
            error: err.message,
            errorDetails: { code: err.code },
          };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          errorDetails: { code: 'WRITE_FAILED' },
        };
      }
    },
  };
}
