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

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.cache/**',
  '**/dist/**',
  '**/*.log',
  '**/.env*',
  '**/.DS_Store',
  '**/coverage/**',
];

const RELEVANT_EXTENSIONS = /\.(ts|tsx|js|jsx|json|toml)$/;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = new Set<string>();

  constructor(private readonly options: WatcherOptions) {}

  start(): void {
    const debounceMs = this.options.debounceMs ?? 300;

    this.watcher = watch(this.options.dir, {
      ignored: IGNORE_PATTERNS,
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
        this.options.onChange(files);
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
  }
}
