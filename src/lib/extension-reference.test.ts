import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { resolveExtensionReference } from './extension-reference';

describe('resolveExtensionReference — BUG-350', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('preserva uma referência explícita', () => {
    expect(resolveExtensionReference('project-id', '/missing')).toBe('project-id');
  });

  it('recusa o alias ambíguo current', () => {
    expect(() => resolveExtensionReference('current', '/missing')).toThrow(/not supported/i);
  });

  it('resolve api_name pelo manifest canônico no cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fmx-bug350-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'fluxomind.extension.toml'), '[extension]\nname = "project-a"\nversion = "1.0.0"\n');
    expect(resolveExtensionReference(undefined, dir)).toBe('project-a');
  });

  it('falha localmente sem manifest em vez de enviar current', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fmx-bug350-'));
    dirs.push(dir);
    expect(() => resolveExtensionReference(undefined, dir)).toThrow(/extension reference/i);
  });
});
