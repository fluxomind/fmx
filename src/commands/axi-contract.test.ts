import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { VERSION } from '../version';
import { projectRows } from './inspect';
const bin = resolve('dist/bin.js');
function run(...args: string[]) { return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, FLUXOMIND_DISABLE_METRICS: '1' } }); }
describe('AXI executable contract', () => {
  it.each(['--version', '-v', '-V'])('supports the bare %s version probe', flag => {
    const result = run(flag); expect(result.status).toBe(0); expect(result.stdout.trim()).toBe(VERSION); expect(result.stderr).toBe('');
  });
  it('returns JSON context without exposing stored credentials', () => {
    const result = run('--format', 'json'); expect(result.status).toBe(0);
    const home = JSON.parse(result.stdout); expect(home.version).toBeTruthy(); expect(home.cwd).toBe(process.cwd());
    expect(result.stdout).not.toMatch(/accessToken|refreshToken|"auth"\s*:/);
  });
  it('rejects unknown flags before a tenant request and includes valid flags', () => {
    const result = run('--format', 'json', 'query', 'fm__object', '--limt', '1');
    expect(result.status).toBe(2); const output = JSON.parse(result.stdout); expect(output.error).toContain('--limt'); expect(output.help).toContain('--limit');
  });
  it('rejects a device-login tenant slug before authentication', () => {
    const result = run('--format', 'json', 'auth', 'login', '--device', '--tenant', 'platform');
    expect(result.status).toBe(2); expect(JSON.parse(result.stdout).error).toContain('tenant-uuid'); expect(result.stderr).toBe('');
  });
  it('blocks reading credentials through the public config command', () => {
    const result = run('--format', 'json', 'config', 'get', 'auth'); expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).error).toContain('public config key');
  });
  it('does not prompt for missing setup flags', () => {
    const result = run('--format', 'json', 'dev-env', 'setup'); expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).error).toContain('--ai-clients');
  });
  it('reports an explicit empty collection and supports complete text', () => {
    expect(projectRows([], ['id'])).toEqual({ rows: [], truncated: false });
    const body = 'a'.repeat(2000);
    expect(projectRows([{ body }], ['body']).rows[0].body).toContain('2000 chars total');
    expect(projectRows([{ body }], ['body'], true)).toEqual({ rows: [{ body }], truncated: false });
  });
});
