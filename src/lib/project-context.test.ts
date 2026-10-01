import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { projectContext } from './project-context';
const root = mkdtempSync(join(tmpdir(), 'fmx-context-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => rmSync(join(root, '.fmx'), { recursive: true, force: true }));
describe('Workspace tenant context', () => {
  it('finds the nearest binding in a parent directory', () => {
    mkdirSync(join(root, '.fmx')); const data = { tenant: '00000000-0000-7000-8000-000000000001', environment: 'test' };
    writeFileSync(join(root, '.fmx/project.json'), JSON.stringify(data));
    expect(projectContext(join(root, 'nested', 'directory'))).toMatchObject(data);
  });
  it('fails on malformed config rather than falling back to a different tenant', () => {
    mkdirSync(join(root, '.fmx')); writeFileSync(join(root, '.fmx/project.json'), '{"tenant":"slug","environment":"test"}');
    expect(() => projectContext(root)).toThrow('Invalid project context');
  });
  it('rejects credential properties in project configuration', () => {
    mkdirSync(join(root, '.fmx')); writeFileSync(join(root, '.fmx/project.json'), JSON.stringify({ tenant: '00000000-0000-7000-8000-000000000001', environment: 'test', token: 'fixture' }));
    expect(() => projectContext(root)).toThrow('credentials do not belong here');
  });
});
