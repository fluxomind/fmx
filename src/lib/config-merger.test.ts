/**
 * Tests for config-merger.
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  mergeJsonConfig,
  computeConfigHash,
  writeLockFile,
  readLockFile,
  detectDrift,
  getLockFilePath,
} from './config-merger';
import type { DevEnvLockFile } from './types/dev-env';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'fmx-merger-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('mergeJsonConfig', () => {
  it('creates file when it does not exist', () => {
    const target = join(workDir, 'a.json');
    const result = mergeJsonConfig(target, { foo: 1 }, 'merge');
    expect(result.action).toBe('created');
    expect(result.addedKeys).toEqual(['foo']);
    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ foo: 1 });
  });

  it('merge adds missing keys and preserves custom values', () => {
    const target = join(workDir, 'a.json');
    writeFileSync(target, JSON.stringify({ kept: 'user-value', nested: { a: 1 } }));
    const result = mergeJsonConfig(target, { added: 2, nested: { a: 9, b: 2 } }, 'merge');
    expect(result.action).toBe('merged');
    expect(result.addedKeys).toContain('added');
    expect(result.addedKeys).toContain('nested.b');
    expect(result.conflicts).toContain('nested.a');
    const final = JSON.parse(readFileSync(target, 'utf-8'));
    expect(final.kept).toBe('user-value');
    expect(final.nested.a).toBe(1);
    expect(final.nested.b).toBe(2);
  });

  it('overwrite replaces content wholesale', () => {
    const target = join(workDir, 'a.json');
    writeFileSync(target, JSON.stringify({ old: 1 }));
    const result = mergeJsonConfig(target, { fresh: 2 }, 'overwrite');
    expect(result.action).toBe('overwritten');
    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ fresh: 2 });
  });

  it('skip does not touch file', () => {
    const target = join(workDir, 'a.json');
    writeFileSync(target, JSON.stringify({ stay: 1 }));
    const result = mergeJsonConfig(target, { never: 2 }, 'skip');
    expect(result.action).toBe('skipped');
    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ stay: 1 });
  });
});

describe('computeConfigHash', () => {
  it('returns null for missing file', () => {
    expect(computeConfigHash(join(workDir, 'missing.json'))).toBeNull();
  });

  it('returns stable hash for same content', () => {
    const target = join(workDir, 'a.json');
    writeFileSync(target, 'abc');
    const h1 = computeConfigHash(target);
    const h2 = computeConfigHash(target);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('changes hash when content changes', () => {
    const target = join(workDir, 'a.json');
    writeFileSync(target, 'abc');
    const h1 = computeConfigHash(target);
    writeFileSync(target, 'xyz');
    const h2 = computeConfigHash(target);
    expect(h1).not.toBe(h2);
  });
});

describe('lock file + drift detection', () => {
  function sampleLock(hashes: Record<string, string>): DevEnvLockFile {
    return {
      presetVersion: '1.0',
      installedAt: '2026-04-19T00:00:00Z',
      aiClients: ['copilot'],
      gitConnected: false,
      configHashes: hashes,
    };
  }

  it('writes and reads lock file idempotently', () => {
    const lock = sampleLock({ '.vscode/mcp.json': 'abc' });
    writeLockFile(workDir, lock);
    expect(existsSync(getLockFilePath(workDir))).toBe(true);
    expect(readLockFile(workDir)).toEqual(lock);
  });

  it('detectDrift reports drifted + missing + unchanged', () => {
    const driftedPath = join(workDir, '.vscode/mcp.json');
    const unchangedPath = join(workDir, '.cursor/mcp.json');
    require('fs').mkdirSync(join(workDir, '.vscode'), { recursive: true });
    require('fs').mkdirSync(join(workDir, '.cursor'), { recursive: true });
    writeFileSync(driftedPath, 'original');
    writeFileSync(unchangedPath, 'same');
    const driftedHash = computeConfigHash(driftedPath)!;
    const unchangedHash = computeConfigHash(unchangedPath)!;
    const lock = sampleLock({
      '.vscode/mcp.json': driftedHash,
      '.cursor/mcp.json': unchangedHash,
      '.continue/config.json': 'ghost',
    });
    writeFileSync(driftedPath, 'EDITED BY USER');
    const report = detectDrift(workDir, lock);
    expect(report.drifted).toContain('.vscode/mcp.json');
    expect(report.unchanged).toContain('.cursor/mcp.json');
    expect(report.missing).toContain('.continue/config.json');
  });
});
