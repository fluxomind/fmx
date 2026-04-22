import { Command } from 'commander';
import { get } from '../lib/api-client';
import { SSEClient } from '../lib/sse-client';
import { info, dim, error as errOut } from '../lib/output';
import { supportsColor } from '../lib/output';

const LEVEL_COLORS: Record<string, string> = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[2m',
};

function formatLog(data: string, json: boolean): void {
  if (json) {
    console.log(data);
    return;
  }

  try {
    const log = JSON.parse(data);
    const color = supportsColor() ? (LEVEL_COLORS[log.level] ?? '') : '';
    const reset = supportsColor() ? '\x1b[0m' : '';
    console.log(`${dim(log.timestamp ?? '')} ${color}[${log.level ?? 'info'}]${reset} ${log.message ?? data}`);
  } catch {
    console.log(data);
  }
}

export const logsCommand = new Command('logs')
  .description('View extension logs')
  .argument('[extensionId]', 'Extension ID')
  .option('--tail', 'Stream logs in real-time')
  .option('--level <level>', 'Filter by level: error, warn, info, debug')
  .option('--since <time>', 'Show logs since (e.g., 1h, 30m, 2024-01-01)')
  .option('--limit <n>', 'Maximum number of log entries', '100')
  .option('--json', 'Output as NDJSON')
  .option('--extension <id>', 'Filter by extension ID (alternative to positional arg) — EVO-394')
  .option('--grep <pattern>', 'Regex match in log message field — EVO-394')
  .option('--trace <cid>', 'Filter by correlation ID (OTel) — EVO-394')
  .action(async (extensionId: string | undefined, opts: { tail?: boolean; level?: string; since?: string; limit: string; json?: boolean; extension?: string; grep?: string; trace?: string }) => {
    const params = new URLSearchParams();
    const effectiveExtension = extensionId ?? opts.extension;
    if (effectiveExtension) params.set('extensionId', effectiveExtension);
    if (opts.level) params.set('level', opts.level);
    if (opts.since) params.set('since', opts.since);
    if (opts.limit) params.set('limit', opts.limit);
    if (opts.grep) params.set('grep', opts.grep);
    if (opts.trace) params.set('trace', opts.trace);

    if (opts.tail) {
      info('Streaming logs... (Ctrl+C to stop)');
      const sse = new SSEClient({
        path: `/api/code-engine/logs/stream?${params.toString()}`,
        onMessage: (_event, data) => formatLog(data, !!opts.json),
        onError: (err) => errOut(`Log stream error: ${err.message}`),
      });

      const cleanup = () => {
        sse.disconnect();
        process.exit(0);
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      await sse.connect();
    } else {
      try {
        const logs = await get<Array<Record<string, unknown>>>(`/api/code-engine/logs?${params.toString()}`);
        for (const log of logs) {
          formatLog(JSON.stringify(log), !!opts.json);
        }
      } catch (err) {
        errOut(`Failed to fetch logs: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  });
