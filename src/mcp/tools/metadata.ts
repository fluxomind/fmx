/**
 * MCP Tool: codeengine_metadata
 * Access object/field metadata via Foundation Libraries → metadataEngine.
 */

import { z } from 'zod';
import type { McpServiceResult } from '../types';

export const TOOL_NAME = 'codeengine_metadata';

export const metadataInputSchema = {
  object: z.string().optional().describe('Object API name. Omit to list all objects.'),
};

export interface ObjectInfo {
  apiName: string;
  label: string;
  fieldCount: number;
}

export interface FieldInfo {
  apiName: string;
  label: string;
  type: string;
  required: boolean;
}

export type MetadataOutput =
  | { objects: ObjectInfo[] }
  | { fields: FieldInfo[] };

/** Dependencies for metadata tool (injected for testability) */
export interface MetadataToolDeps {
  listObjects: (tenantId: string) => Promise<McpServiceResult<{ objects: ObjectInfo[] }>>;
  getObjectFields: (objectName: string, tenantId: string) => Promise<McpServiceResult<{ fields: FieldInfo[] }>>;
}

/** Metadata tool handler */
export async function handleMetadata(
  args: { object?: string },
  tenantId: string,
  deps: MetadataToolDeps,
): Promise<McpServiceResult<MetadataOutput>> {
  if (!args.object) {
    const result = await deps.listObjects(tenantId);
    if (!result.success) {
      return {
        success: false,
        error: result.error ?? 'Failed to list objects',
        errorDetails: { code: 'METADATA_FAILED', ...result.errorDetails },
      };
    }
    return { success: true, data: result.data ?? { objects: [] } };
  }

  const result = await deps.getObjectFields(args.object, tenantId);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? `Object '${args.object}' not found in metadata`,
      errorDetails: { code: 'OBJECT_NOT_FOUND', objectName: args.object, ...result.errorDetails },
    };
  }
  return { success: true, data: result.data ?? { fields: [] } };
}
