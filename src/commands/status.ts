import { Command } from 'commander';
import { get } from '../lib/api-client';
import { success, info, dim, table } from '../lib/output';

export const statusCommand = new Command('status')
  .description('Show extension status')
  .argument('[extensionId]', 'Extension ID')
  .option('--metrics', 'Show detailed metrics (latency p50/95/99, memory)')
  .option('--json', 'Output as JSON')
  .action(async (extensionId: string | undefined, opts: { metrics?: boolean; json?: boolean }) => {
    const id = extensionId ?? 'current'; // TODO: resolve from manifest in cwd

    try {
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
      }>(`/api/code-engine/extensions/${id}`);

      if (opts.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      success(`${status.name} v${status.version}`);
      info(`  Status: ${status.status}`);
      info(`  Triggers: ${status.triggers} active`);
      info(`  Executions (24h): ${status.executions24h}`);
      if (status.lastExecution) {
        info(`  Last execution: ${dim(status.lastExecution)}`);
      }

      if (opts.metrics && status.metrics) {
        info('\n  Metrics:');
        table([
          { metric: 'Latency p50', value: `${status.metrics.latencyP50}ms` },
          { metric: 'Latency p95', value: `${status.metrics.latencyP95}ms` },
          { metric: 'Latency p99', value: `${status.metrics.latencyP99}ms` },
          { metric: 'Memory', value: `${status.metrics.memoryMB}MB` },
        ]);
      }
    } catch (err) {
      console.error(`Failed to get status: ${(err as Error).message}`);
      process.exit(1);
    }
  });
