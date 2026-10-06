/**
 * Bundler — collect source files, compute hashes, create bundle
 * @package @fluxomind/cli
 */

import { readdirSync, readFileSync, statSync, existsSync, lstatSync } from 'fs';
import { join, relative, resolve, isAbsolute } from 'path';
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
  deletedFiles?: string[];
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
  const totalSize = files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0);
  const totalHash = hashContent(files.map((f) => f.hash).sort().join(''));
  return { files, totalHash, totalSize };
}

export function createIncrementalBundle(
  projectDir: string,
  previousHashes: Map<string, string>,
  changedPaths?: string[],
): Bundle {
  const base = resolve(projectDir);
  let allFiles: BundleFile[];
  const deletedFiles: string[] = [];
  if (!changedPaths || previousHashes.size === 0) {
    allFiles = collectFiles(base);
    const present = new Set(allFiles.map(file => file.path));
    for (const path of previousHashes.keys()) if (!present.has(path)) deletedFiles.push(path);
  } else {
    allFiles = [];
    for (const changed of new Set(changedPaths)) {
      const fullPath = resolve(changed);
      const path = relative(base, fullPath);
      if (isAbsolute(path) || path === '..' || path.startsWith('../') || !shouldInclude(path)) continue;
      if (!existsSync(fullPath)) { if (previousHashes.has(path)) deletedFiles.push(path); continue; }
      if (!lstatSync(fullPath).isFile()) continue;
      const content = readFileSync(fullPath, 'utf8');
      allFiles.push({ path, content, hash: hashContent(content) });
    }
  }
  const files = allFiles.filter(file => previousHashes.get(file.path) !== file.hash);
  const hashes = new Map(previousHashes);
  for (const file of allFiles) hashes.set(file.path, file.hash);
  for (const path of deletedFiles) hashes.delete(path);
  return { files, deletedFiles, totalHash: hashContent([...hashes].map(([path, hash]) => path + ':' + hash).sort().join('')), totalSize: files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) };
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
