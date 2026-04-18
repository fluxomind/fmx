/**
 * Integration tests for `fmx dev-env` — setup non-interactive + doctor + merge.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('../lib/auth-manager', () => ({
  getAuthStatus: jest.fn(() => ({ authenticated: true, tenant: 'core_template', email: 'dev@example.com' })),
  getAuthToken: jest.fn(() => 'test-token'),
  getStoredTenants: jest.fn(() => ['core_template']),
  getTenantAuth: jest.fn(() => ({ accessToken: 'test-token' })),
}));

jest.mock('../lib/config-manager', () => ({
  loadConfig: jest.fn(() => ({ apiBaseUrl: 'http://localhost:3000', outputFormat: 'text' })),
  getConfigPath: jest.fn(() => '/tmp/fake-config.json'),
  getConfigDir: jest.fn(() => '/tmp/fake-dir'),
}));

jest.mock('../lib/preflight', () => ({
  runPreflight: jest.fn(async () => ({
    node: { version: '20.0.0', raw: 'v20.0.0', ok: true },
    npm: { version: '10.0.0', raw: '10.0.0', ok: true },
    git: { version: '2.40.0', raw: 'git version 2.40.0', ok: true },
    deno: { version: null, raw: null, ok: true },
    ollama: { version: null, raw: null, ok: false },
    ramGb: 16,
    abort: false,
    blockers: [],
    warnings: [],
  })),
  ramToolingHint: jest.fn((ramGb: number) => ({
    recommendedModel: ramGb < 8 ? 'qwen2.5-coder:1.5b' : 'qwen2.5-coder:7b',
  })),
}));

jest.mock('../lib/dev-env-metrics', () => ({
  incrementWizardCompletion: jest.fn(),
  incrementPresetSelections: jest.fn(),
  recordDevEnvLog: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 0, stdout: Buffer.from('ok'), stderr: Buffer.from('') })),
}));

let workDir: string;
let originalCwd: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'fmx-dev-env-'));
  originalCwd = process.cwd();
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
  jest.clearAllMocks();
});

describe('fmx dev-env setup (non-interactive)', () => {
  it('generates configs for copilot + cursor without prompts and writes lock file', async () => {
    const { devEnvCommand } = await import('./dev-env');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await devEnvCommand.parseAsync([
      'node',
      'fmx',
      'setup',
      '--ai-clients',
      'copilot,cursor',
      '--skip-smoke',
    ]);

    expect(existsSync(join(workDir, '.vscode/mcp.json'))).toBe(true);
    expect(existsSync(join(workDir, '.vscode/settings.json'))).toBe(true);
    expect(existsSync(join(workDir, '.vscode/extensions.json'))).toBe(true);
    expect(existsSync(join(workDir, '.cursor/mcp.json'))).toBe(true);
    expect(existsSync(join(workDir, '.mcp.json'))).toBe(false);
    expect(existsSync(join(workDir, '.fluxomind/dev-env.lock.json'))).toBe(true);

    const vsMcp = JSON.parse(readFileSync(join(workDir, '.vscode/mcp.json'), 'utf-8'));
    expect(vsMcp.servers.fluxomind.command).toBe('fmx');
    expect(vsMcp.servers.fluxomind.args).toEqual(['mcp', 'serve']);

    const cursorMcp = JSON.parse(readFileSync(join(workDir, '.cursor/mcp.json'), 'utf-8'));
    expect(cursorMcp.mcpServers.fluxomind.command).toBe('fmx');

    const lock = JSON.parse(readFileSync(join(workDir, '.fluxomind/dev-env.lock.json'), 'utf-8'));
    expect(lock.aiClients.sort()).toEqual(['copilot', 'cursor']);
    expect(lock.presetVersion).toBe('1.0');
    expect(lock.configHashes['.vscode/mcp.json']).toHaveLength(64);

    exitSpy.mockRestore();
  });

  it('preserves user values on merge when config already exists', async () => {
    mkdirSync(join(workDir, '.vscode'), { recursive: true });
    writeFileSync(
      join(workDir, '.vscode/settings.json'),
      JSON.stringify({ 'editor.fontSize': 16, 'user.custom': 'keep-me' }),
    );

    const { devEnvCommand } = await import('./dev-env');
    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await devEnvCommand.parseAsync([
      'node',
      'fmx',
      'setup',
      '--ai-clients',
      'copilot',
      '--skip-smoke',
    ]);

    const merged = JSON.parse(readFileSync(join(workDir, '.vscode/settings.json'), 'utf-8'));
    expect(merged['editor.fontSize']).toBe(16);
    expect(merged['user.custom']).toBe('keep-me');
    expect(merged['github.copilot.chat.mcp.enabled']).toBe(true);
    expect(merged['fluxomind.devEnv.presetVersion']).toBe('1.0');
  });

  it('generates Claude Code preset with both .mcp.json and .claude/settings.json', async () => {
    const { devEnvCommand } = await import('./dev-env');
    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await devEnvCommand.parseAsync([
      'node',
      'fmx',
      'setup',
      '--ai-clients',
      'claude-code',
      '--skip-smoke',
    ]);

    expect(existsSync(join(workDir, '.mcp.json'))).toBe(true);
    expect(existsSync(join(workDir, '.claude/settings.json'))).toBe(true);
    const claude = JSON.parse(readFileSync(join(workDir, '.claude/settings.json'), 'utf-8'));
    expect(claude.permissions.allow).toEqual(['Bash(fmx:*)', 'Bash(git:*)', 'Bash(npm:*)']);
    expect(claude.enabledMcpjsonServers).toEqual(['fluxomind']);
  });

  it('uses Ollama template with localhost for continue-ollama preset', async () => {
    const { devEnvCommand } = await import('./dev-env');
    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await devEnvCommand.parseAsync([
      'node',
      'fmx',
      'setup',
      '--ai-clients',
      'continue-ollama',
      '--skip-smoke',
    ]);

    const cfg = JSON.parse(readFileSync(join(workDir, '.continue/config.json'), 'utf-8'));
    expect(cfg.models[0].apiBase).toBe('http://localhost:11434');
    expect(cfg.mcpServers[0].command).toBe('fmx');
  });

  it('rejects unknown AI client', async () => {
    const { devEnvCommand } = await import('./dev-env');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await expect(
      devEnvCommand.parseAsync(['node', 'fmx', 'setup', '--ai-clients', 'bogus', '--skip-smoke']),
    ).rejects.toThrow(/__exit/);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('fmx dev-env doctor', () => {
  it('exits 0 when environment is healthy and lock file present', async () => {
    const { devEnvCommand } = await import('./dev-env');

    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await devEnvCommand.parseAsync([
      'node',
      'fmx',
      'setup',
      '--ai-clients',
      'copilot',
      '--skip-smoke',
    ]);

    const doctorExit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;

    await expect(devEnvCommand.parseAsync(['node', 'fmx', 'doctor'])).rejects.toThrow(/__exit\(0\)/);
    expect(doctorExit).toHaveBeenCalledWith(0);
  });

  it('exits 1 when lock file points to missing config', async () => {
    const { devEnvCommand } = await import('./dev-env');

    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await devEnvCommand.parseAsync([
      'node',
      'fmx',
      'setup',
      '--ai-clients',
      'copilot',
      '--skip-smoke',
    ]);

    rmSync(join(workDir, '.vscode/mcp.json'), { force: true });

    global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;

    const doctorExit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await expect(devEnvCommand.parseAsync(['node', 'fmx', 'doctor'])).rejects.toThrow(/__exit\(1\)/);
    expect(doctorExit).toHaveBeenCalledWith(1);
  });
});

describe('fmx mcp serve wire-up (D9)', () => {
  it('generated configs invoke `fmx mcp serve` as command+args — matches GAP-180 delivery', async () => {
    const { devEnvCommand } = await import('./dev-env');
    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await devEnvCommand.parseAsync([
      'node',
      'fmx',
      'setup',
      '--ai-clients',
      'copilot,cursor,claude-code,continue-ollama',
      '--skip-smoke',
    ]);

    const inspections = [
      { path: '.vscode/mcp.json', pick: (j: Record<string, unknown>) => (j.servers as Record<string, { command: string; args: string[] }>).fluxomind },
      { path: '.cursor/mcp.json', pick: (j: Record<string, unknown>) => (j.mcpServers as Record<string, { command: string; args: string[] }>).fluxomind },
      { path: '.mcp.json', pick: (j: Record<string, unknown>) => (j.mcpServers as Record<string, { command: string; args: string[] }>).fluxomind },
      { path: '.continue/config.json', pick: (j: Record<string, unknown>) => (j.mcpServers as Array<{ command: string; args: string[] }>)[0] },
    ];
    for (const { path, pick } of inspections) {
      const cfg = JSON.parse(readFileSync(join(workDir, path), 'utf-8')) as Record<string, unknown>;
      const entry = pick(cfg);
      expect(entry.command).toBe('fmx');
      expect(entry.args).toEqual(['mcp', 'serve']);
    }
  });
});
