import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBundle, createIncrementalBundle } from './bundler';
describe('incremental bundle', () => {
  it('reads only changed paths and reports deleted files without changing the acknowledged baseline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fmx-bundle-'));
    try {
      writeFileSync(join(dir,'a.ts'), 'á'); writeFileSync(join(dir,'b.ts'), 'old');
      const initial = createBundle(dir); expect(initial.totalSize).toBe(5);
      const previous = new Map(initial.files.map(file => [file.path,file.hash]));
      writeFileSync(join(dir,'a.ts'), 'new'); writeFileSync(join(dir,'b.ts'), 'not-observed');
      const changed = createIncrementalBundle(dir, previous, [join(dir,'a.ts')]);
      expect(changed.files.map(file => file.path)).toEqual(['a.ts']); expect(previous.get('a.ts')).toBe(initial.files.find(file => file.path==='a.ts')?.hash);
      rmSync(join(dir,'a.ts')); expect(createIncrementalBundle(dir, previous, [join(dir,'a.ts')]).deletedFiles).toEqual(['a.ts']);
      expect(createIncrementalBundle(dir, previous, [join(dir,'../outside.ts')]).files).toEqual([]);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
});
