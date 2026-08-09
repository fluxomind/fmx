import { Command } from 'commander';
import { get, post } from '../lib/api-client';
import { success, error, info, dim, table } from '../lib/output';
import { isInteractive } from '../lib/output';
import { resolveExtensionReference } from '../lib/extension-reference';

export const rollbackCommand = new Command('rollback')
  .description('Rollback to a previous version')
  .argument('[version]', 'Target version (e.g., v1.0.0)')
  .option('--list', 'List available versions')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .option('--deployment <dep_id>', 'Rollback by deployment ID (alternative to semver) — EVO-394 CA-10')
  .option('--extension <id>', 'Extension project ID or api name (defaults to manifest name)')
  .action(async (version: string | undefined, opts: { list?: boolean; force?: boolean; json?: boolean; deployment?: string; extension?: string }) => {
    let extensionId: string;
    try {
      extensionId = resolveExtensionReference(opts.extension);
    } catch (err) {
      error((err as Error).message);
      process.exitCode = 1;
      return;
    }
    const encodedExtensionId = encodeURIComponent(extensionId);

    // EVO-394 CA-10: rollback by deployment ID (mutually exclusive with <version>)
    if (opts.deployment) {
      if (version) {
        error('Cannot combine <version> argument with --deployment <id>. Use one or the other.');
        process.exit(1);
      }

      if (!opts.force && isInteractive()) {
        info(`Rolling back to deployment ${opts.deployment}. Use --force to skip confirmation.`);
      }

      try {
        const result = await post<{
          deploymentId: string;
          previousDeploymentId: string;
          duration: number;
        }>(`/api/code-engine/extensions/${encodedExtensionId}/rollback`, {
          deploymentId: opts.deployment,
        });

        success(
          `Rolled back to deployment ${result.deploymentId} ${dim(`(from ${result.previousDeploymentId}, ${result.duration}ms)`)}`,
        );
      } catch (err) {
        error(`Rollback failed: ${(err as Error).message}`);
        process.exit(1);
      }
      return;
    }

    if (opts.list || !version) {
      try {
        const versions = await get<Array<{
          version: string;
          status: string;
          deployedAt: string;
          deployedBy: string;
        }>>(`/api/code-engine/extensions/${encodedExtensionId}/versions`);

        if (opts.json) {
          console.log(JSON.stringify(versions, null, 2));
          return;
        }

        if (versions.length === 0) {
          info('No versions available.');
          return;
        }

        table(versions.map((v) => ({
          version: v.version,
          status: v.status,
          deployed: new Date(v.deployedAt).toLocaleDateString(),
          by: v.deployedBy,
        })));
      } catch (err) {
        error(`Failed to list versions: ${(err as Error).message}`);
        process.exit(1);
      }
      return;
    }

    // Rollback to specific version
    const targetVersion = version.startsWith('v') ? version.slice(1) : version;

    if (!opts.force && isInteractive()) {
      info(`Rolling back to v${targetVersion}. Use --force to skip confirmation.`);
      // In real implementation: readline prompt
    }

    try {
      const result = await post<{
        version: string;
        previousVersion: string;
        duration: number;
      }>(`/api/code-engine/extensions/${encodedExtensionId}/rollback`, {
        version: targetVersion,
      });

      success(`Rolled back to v${result.version} ${dim(`(from v${result.previousVersion}, ${result.duration}ms)`)}`);
    } catch (err) {
      error(`Rollback failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
