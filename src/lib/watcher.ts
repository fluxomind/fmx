/**
 * Filesystem Watcher — chokidar wrapper with debounce
 * @package @fluxomind/cli
 */

import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';

export interface WatcherOptions {
  dir: string;
  debounceMs?: number;
  onChange: (changedFiles: string[]) => void | Promise<void>;
}

// Chokidar 4 does not expand globs. Match path segments instead.
export function ignoredPath(path: string): boolean {
  const segments = path.replace(/\\/g, '/').split('/');
  const name = segments.at(-1) ?? '';
  return segments.some((part) => ['node_modules', '.git', '.cache', 'dist', 'coverage'].includes(part))
    || name.endsWith('.log') || name.startsWith('.env') || name === '.DS_Store';
}

const RELEVANT_EXTENSIONS = /\.(ts|tsx|js|jsx|json|toml)$/;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> = Promise.resolve();
  private pendingChanges = new Set<string>();

  constructor(private readonly options: WatcherOptions) {}

  start(): void {
    const debounceMs = this.options.debounceMs ?? 300;

    this.watcher = watch(this.options.dir, {
      ignored: ignoredPath,
      persistent: true,
      ignoreInitial: true,
    });

    const handleChange = (path: string) => {
      if (!RELEVANT_EXTENSIONS.test(path)) return;

      this.pendingChanges.add(path);

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        const files = Array.from(this.pendingChanges);
        this.pendingChanges.clear();
        this.running = this.running.then(async () => { await this.options.onChange(files); }).catch(error => { console.error('Watcher change failed:', error instanceof Error ? error.message : String(error)); });
      }, debounceMs);
    };

    this.watcher.on('change', handleChange);
    this.watcher.on('add', handleChange);
    this.watcher.on('unlink', handleChange);
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.watcher?.close();
    this.watcher = null;
    await this.running;
  }
}
