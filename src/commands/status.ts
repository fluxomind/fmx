import { Command } from 'commander';
import { get } from '../lib/api-client';
import { print, configureOutput, error } from '../lib/output';
import { resolveExtensionReference } from '../lib/extension-reference';

export const statusCommand = new Command('status')
  .description('Show extension status')
  .argument('[extensionId]', 'Extension ID')
  .option('--metrics', 'Show detailed metrics (latency p50/95/99, memory)')
  .option('--json', 'Output as JSON')
  .action(async (extensionId: string | undefined, opts: { metrics?: boolean; json?: boolean }) => {
    try {
      const id = resolveExtensionReference(extensionId);
      const status = await get<{
        name: string;
        version: string;
        status: string;
        triggers: number;
        executions24h: number;
        lastExecution?: string;
        metrics?: {
          latencyP50: number;
          latencyP95: number;
          latencyP99: number;
          memoryMB: number;
        };
      }>(`/api/code-engine/extensions/${encodeURIComponent(id)}`);

      if (opts.json) configureOutput('json');
      const { metrics, ...summary } = status;
      print(opts.metrics ? status : summary);
    } catch (err) {
      error(`Failed to get status: ${(err as Error).message}`);
      process.exit(1);
    }
  });
