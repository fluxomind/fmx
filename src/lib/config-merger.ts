/**
 * Config Merger — idempotent JSON merge + hash-based drift detection.
 * @package @fluxomind/cli
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type {
  DevEnvLockFile,
  DriftReport,
  MergeResult,
  MergeStrategy,
} from './types/dev-env';

export const LOCK_FILE_DIR = '.fluxomind';
export const LOCK_FILE_NAME = 'dev-env.lock.json';

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeMissing(target: JsonObject, source: JsonObject, path: string, addedKeys: string[], conflicts: string[]): JsonObject {
  for (const [key, incoming] of Object.entries(source)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (!(key in target)) {
      target[key] = incoming;
      addedKeys.push(currentPath);
      continue;
    }
    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(incoming)) {
      deepMergeMissing(existing, incoming, currentPath, addedKeys, conflicts);
      continue;
    }
    if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
      conflicts.push(currentPath);
    }
  }
  return target;
}

function readJsonSafe(path: string): JsonObject | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export function mergeJsonConfig(
  filePath: string,
  incoming: JsonObject,
  strategy: MergeStrategy,
): MergeResult {
  const existing = readJsonSafe(filePath);

  if (!existing) {
    writeJson(filePath, incoming);
    return { path: filePath, action: 'created', addedKeys: Object.keys(incoming), conflicts: [] };
  }

  if (strategy === 'skip') {
    return { path: filePath, action: 'skipped', addedKeys: [], conflicts: [] };
  }

  if (strategy === 'overwrite') {
    writeJson(filePath, incoming);
    return { path: filePath, action: 'overwritten', addedKeys: Object.keys(incoming), conflicts: [] };
  }

  const addedKeys: string[] = [];
  const conflicts: string[] = [];
  const merged = deepMergeMissing({ ...existing }, incoming, '', addedKeys, conflicts);
  writeJson(filePath, merged);
  return { path: filePath, action: 'merged', addedKeys, conflicts };
}

export function computeConfigHash(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath);
  return createHash('sha256').update(raw).digest('hex');
}

export function getLockFilePath(workspaceDir: string): string {
  return join(workspaceDir, LOCK_FILE_DIR, LOCK_FILE_NAME);
}

export function readLockFile(workspaceDir: string): DevEnvLockFile | null {
  const path = getLockFilePath(workspaceDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as DevEnvLockFile;
  } catch {
    return null;
  }
}

export function writeLockFile(workspaceDir: string, data: DevEnvLockFile): void {
  writeJson(getLockFilePath(workspaceDir), data);
}

export function detectDrift(workspaceDir: string, lock: DevEnvLockFile): DriftReport {
  const drifted: string[] = [];
  const missing: string[] = [];
  const unchanged: string[] = [];

  for (const [relPath, expectedHash] of Object.entries(lock.configHashes)) {
    const absPath = join(workspaceDir, relPath);
    const currentHash = computeConfigHash(absPath);
    if (currentHash === null) {
      missing.push(relPath);
      continue;
    }
    if (currentHash !== expectedHash) drifted.push(relPath);
    else unchanged.push(relPath);
  }

  return { drifted, missing, unchanged };
}
