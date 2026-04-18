/**
 * Bundler — collect source files, compute hashes, create bundle
 * @package @fluxomind/cli
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

export interface BundleFile {
  path: string;
  content: string;
  hash: string;
}

export interface Bundle {
  files: BundleFile[];
  totalHash: string;
  totalSize: number;
}

const IGNORE_PATTERNS = [
  'node_modules', '.git', 'dist', '.env', '.env.local',
  '.DS_Store', '*.log', 'coverage',
];

const INCLUDE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.toml'];

function shouldInclude(filePath: string): boolean {
  const name = filePath.split('/').pop() ?? '';
  if (IGNORE_PATTERNS.some((p) => {
    if (p.startsWith('*')) return name.endsWith(p.slice(1));
    return filePath.includes(p);
  })) return false;
  return INCLUDE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function collectFiles(dir: string, basePath: string = dir): BundleFile[] {
  const files: BundleFile[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (!IGNORE_PATTERNS.includes(entry)) {
        files.push(...collectFiles(fullPath, basePath));
      }
    } else if (shouldInclude(relative(basePath, fullPath))) {
      const content = readFileSync(fullPath, 'utf-8');
      files.push({
        path: relative(basePath, fullPath),
        content,
        hash: hashContent(content),
      });
    }
  }
  return files;
}

export function createBundle(projectDir: string): Bundle {
  const files = collectFiles(projectDir);
  const totalSize = files.reduce((sum, f) => sum + f.content.length, 0);
  const totalHash = hashContent(files.map((f) => f.hash).sort().join(''));
  return { files, totalHash, totalSize };
}

export function createIncrementalBundle(
  projectDir: string,
  previousHashes: Map<string, string>
): Bundle {
  const allFiles = collectFiles(projectDir);
  const changedFiles = allFiles.filter((f) => previousHashes.get(f.path) !== f.hash);
  const totalHash = hashContent(allFiles.map((f) => f.hash).sort().join(''));
  const totalSize = changedFiles.reduce((sum, f) => sum + f.content.length, 0);
  return { files: changedFiles, totalHash, totalSize };
}

const MAX_BUNDLE_SIZE = 50 * 1024 * 1024; // 50MB

export function validateBundleSize(bundle: Bundle): { valid: boolean; warning?: string } {
  if (bundle.totalSize > MAX_BUNDLE_SIZE) {
    return { valid: false, warning: `Bundle exceeds 50MB limit (${(bundle.totalSize / 1024 / 1024).toFixed(1)}MB)` };
  }
  if (bundle.totalSize > 20 * 1024 * 1024) {
    return { valid: true, warning: `Bundle is large (${(bundle.totalSize / 1024 / 1024).toFixed(1)}MB). Consider optimizing.` };
  }
  return { valid: true };
}
