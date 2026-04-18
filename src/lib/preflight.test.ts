/**
 * Tests for preflight checker.
 */

import { ramToolingHint, runPreflight } from './preflight';

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;
type ExecImpl = (
  cmd: string,
  opts: { timeout: number },
  cb: ExecCallback,
) => void;

const execMock = jest.fn<void, Parameters<ExecImpl>>();

jest.mock('child_process', () => ({
  exec: (cmd: string, opts: { timeout: number }, cb: ExecCallback) =>
    execMock(cmd, opts, cb),
}));

function queueExecResponses(responses: Record<string, { stdout?: string; err?: Error }>): void {
  execMock.mockImplementation((cmd, _opts, cb) => {
    const match = Object.entries(responses).find(([key]) => cmd.startsWith(key));
    if (!match) {
      cb(new Error(`unmocked: ${cmd}`), '', '');
      return;
    }
    const [, entry] = match;
    if (entry.err) cb(entry.err, '', '');
    else cb(null, entry.stdout ?? '', '');
  });
}

describe('runPreflight', () => {
  beforeEach(() => {
    execMock.mockReset();
  });

  it('returns abort=false when Node>=18 + npm present and warnings for missing optional tools', async () => {
    queueExecResponses({
      'node': { stdout: 'v20.11.0\n' },
      'npm': { stdout: '10.2.4\n' },
      'git': { stdout: 'git version 2.43.0\n' },
      'deno': { err: new Error('not found') },
      'ollama': { err: new Error('not found') },
    });
    const result = await runPreflight();
    expect(result.abort).toBe(false);
    expect(result.node.ok).toBe(true);
    expect(result.node.version).toBe('20.11.0');
    expect(result.ollama.version).toBeNull();
    expect(result.warnings.some((w) => w.includes('ollama'))).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('sets abort when Node<18', async () => {
    queueExecResponses({
      'node': { stdout: 'v16.20.0\n' },
      'npm': { stdout: '8.19.0\n' },
      'git': { err: new Error('x') },
      'deno': { err: new Error('x') },
      'ollama': { err: new Error('x') },
    });
    const result = await runPreflight();
    expect(result.abort).toBe(true);
    expect(result.blockers.some((b) => b.includes('Node'))).toBe(true);
  });

  it('warns when git missing and continues', async () => {
    queueExecResponses({
      'node': { stdout: 'v20.0.0\n' },
      'npm': { stdout: '10.0.0\n' },
      'git': { err: new Error('x') },
      'deno': { err: new Error('x') },
      'ollama': { err: new Error('x') },
    });
    const result = await runPreflight();
    expect(result.abort).toBe(false);
    expect(result.warnings.some((w) => w.includes('git'))).toBe(true);
  });

  it('aborts when Node missing entirely', async () => {
    queueExecResponses({
      'node': { err: new Error('ENOENT') },
      'npm': { err: new Error('ENOENT') },
      'git': { err: new Error('x') },
      'deno': { err: new Error('x') },
      'ollama': { err: new Error('x') },
    });
    const result = await runPreflight();
    expect(result.abort).toBe(true);
    expect(result.blockers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ramToolingHint', () => {
  it('recommends tiny model under 8GB with warning', () => {
    const hint = ramToolingHint(4);
    expect(hint.recommendedModel).toBe('qwen2.5-coder:1.5b');
    expect(hint.warning).toBeDefined();
  });

  it('recommends 7b for 8-16GB range without warning', () => {
    const hint = ramToolingHint(12);
    expect(hint.recommendedModel).toBe('qwen2.5-coder:7b');
    expect(hint.warning).toBeUndefined();
  });

  it('recommends 14b at 16GB+', () => {
    const hint = ramToolingHint(32);
    expect(hint.recommendedModel).toBe('qwen2.5-coder:14b');
    expect(hint.warning).toBeUndefined();
  });
});
