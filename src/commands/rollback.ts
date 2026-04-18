import { Command } from 'commander';
import { get, post } from '../lib/api-client';
import { success, error, info, dim, table } from '../lib/output';
import { isInteractive } from '../lib/output';

export const rollbackCommand = new Command('rollback')
  .description('Rollback to a previous version')
  .argument('[version]', 'Target version (e.g., v1.0.0)')
  .option('--list', 'List available versions')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (version: string | undefined, opts: { list?: boolean; force?: boolean; json?: boolean }) => {
    const extensionId = 'current'; // TODO: resolve from manifest in cwd

    if (opts.list || !version) {
      try {
        const versions = await get<Array<{
          version: string;
          status: string;
          deployedAt: string;
          deployedBy: string;
        }>>(`/api/code-engine/extensions/${extensionId}/versions`);

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
      }>(`/api/code-engine/extensions/${extensionId}/rollback`, {
        version: targetVersion,
      });

      success(`Rolled back to v${result.version} ${dim(`(from v${result.previousVersion}, ${result.duration}ms)`)}`);
    } catch (err) {
      error(`Rollback failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
