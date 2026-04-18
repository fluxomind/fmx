import { Command } from 'commander';
import { FileWatcher } from '../lib/watcher';
import { createIncrementalBundle } from '../lib/bundler';
import { validateManifestLocal } from '../lib/manifest';
import { post } from '../lib/api-client';
import { SSEClient } from '../lib/sse-client';
import { success, error, info, dim } from '../lib/output';

export const devCommand = new Command('dev')
  .description('Start development mode (watch + auto-deploy)')
  .option('-d, --dir <path>', 'Project directory', '.')
  .action(async (opts: { dir: string }) => {
    const manifest = validateManifestLocal(opts.dir);
    if (!manifest.valid) {
      error('Manifest validation failed:');
      manifest.errors.forEach((e) => error(`  ${e}`));
      process.exit(1);
    }

    info(`Starting dev mode for "${manifest.manifest!.name}"...`);

    // Create dev session
    let sessionId: string;
    try {
      const session = await post<{ sessionId: string }>('/api/code-engine/dev/session', {
        extensionName: manifest.manifest!.name,
      });
      sessionId = session.sessionId;
      success(`Dev session created: ${dim(sessionId)}`);
    } catch (err) {
      error(`Failed to create dev session: ${(err as Error).message}`);
      process.exit(1);
    }

    // Start log streaming
    const sse = new SSEClient({
      path: `/api/code-engine/logs/stream?extensionId=${manifest.manifest!.name}&level=info`,
      onMessage: (_event, data) => {
        try {
          const log = JSON.parse(data);
          console.log(`${dim(log.timestamp ?? '')} [${log.level ?? 'info'}] ${log.message ?? data}`);
        } catch {
          console.log(data);
        }
      },
    });
    sse.connect().catch(() => {});

    let deployCount = 0;
    const previousHashes = new Map<string, string>();

    // Start watcher
    const watcher = new FileWatcher({
      dir: opts.dir,
      debounceMs: 300,
      onChange: async (_changedFiles) => {
        const bundle = createIncrementalBundle(opts.dir, previousHashes);
        if (bundle.files.length === 0) return;

        try {
          const result = await post<{ version: string; duration: number }>('/api/code-engine/dev/upload', {
            sessionId,
            files: bundle.files.map((f) => ({ path: f.path, content: f.content })),
          });
          deployCount++;
          bundle.files.forEach((f) => previousHashes.set(f.path, f.hash));
          success(`Deployed ${dim(`(${result.duration}ms, ${bundle.files.length} files)`)}`);
        } catch (err) {
          error(`Deploy failed: ${(err as Error).message}`);
        }
      },
    });

    watcher.start();
    info(`Watching for changes... ${dim('(Ctrl+C to stop)')}`);

    // Graceful shutdown
    const cleanup = async () => {
      info('\nStopping dev mode...');
      await watcher.stop();
      sse.disconnect();
      try {
        await post('/api/code-engine/dev/session', { sessionId, action: 'close' });
      } catch { /* ignore */ }
      success(`Session ended (${deployCount} deploys)`);
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
