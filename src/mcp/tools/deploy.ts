/**
 * MCP Tool: codeengine_deploy
 * Deploy extension via Direct Deploy path (upload direto, sem Git).
 * Adapter MCP → Foundation Libraries de deploy.
 */

import { z } from 'zod';
import type { McpServiceResult } from '../types';

export const TOOL_NAME = 'codeengine_deploy';

export const deployInputSchema = {
  extensionPath: z.string().describe('Path to the extension project directory'),
};

export interface DeployOutput {
  version: string;
  status: string;
  url: string;
}

/** Audit trail recorder function signature */
export type RecordAuditEvent = (event: {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  layer: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}) => Promise<void>;

/** Dependencies for deploy tool (injected for testability) */
export interface DeployToolDeps {
  validateManifest: (extensionPath: string) => Promise<McpServiceResult<{ name: string; version: string }>>;
  deployExtension: (extensionPath: string, tenantId: string) => Promise<McpServiceResult<DeployOutput>>;
  recordAuditEvent?: RecordAuditEvent;
}

/** Deploy tool handler */
export async function handleDeploy(
  args: { extensionPath: string },
  tenantId: string,
  deps: DeployToolDeps,
  userId?: string,
): Promise<McpServiceResult<DeployOutput>> {
  // Validate manifest first
  const manifestResult = await deps.validateManifest(args.extensionPath);
  if (!manifestResult.success) {
    return {
      success: false,
      error: manifestResult.error ?? 'Invalid manifest',
      errorDetails: { code: 'MANIFEST_INVALID', ...manifestResult.errorDetails },
    };
  }

  const extensionName = manifestResult.data?.name ?? args.extensionPath;

  // Deploy via Direct Deploy path
  const deployResult = await deps.deployExtension(args.extensionPath, tenantId);

  // Record audit trail (fire-and-forget — deploy result is returned regardless)
  if (deps.recordAuditEvent && userId) {
    deps.recordAuditEvent({
      tenantId,
      userId,
      action: deployResult.success ? 'extension.deploy.success' : 'extension.deploy.failure',
      resource: extensionName,
      layer: 'codeEngine',
      metadata: {
        extensionPath: args.extensionPath,
        version: deployResult.data?.version,
        status: deployResult.data?.status ?? 'failed',
        error: deployResult.error,
      },
    }).catch(() => { /* audit trail failure should not block deploy response */ });
  }

  if (!deployResult.success) {
    return {
      success: false,
      error: deployResult.error ?? 'Deploy failed',
      errorDetails: { code: 'DEPLOY_FAILED', ...deployResult.errorDetails },
    };
  }

  return { success: true, data: deployResult.data };
}
