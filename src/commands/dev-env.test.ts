import { vi } from 'vitest';
/**
 * Integration tests for `fmx dev-env` — setup non-interactive + doctor + merge.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../lib/auth-manager', () => ({
  getAuthStatus: vi.fn(() => ({ authenticated: true, tenant: 'core_template', email: 'dev@example.com' })),
  getAuthToken: vi.fn(() => 'test-token'),
  getStoredTenants: vi.fn(() => ['core_template']),
  getTenantAuth: vi.fn(() => ({ accessToken: 'test-token' })),
}));

vi.mock('../lib/config-manager', () => ({
  loadConfig: vi.fn(() => ({ apiBaseUrl: 'http://localhost:3000', outputFormat: 'text' })),
  getConfigPath: vi.fn(() => '/tmp/fake-config.json'),
  getConfigDir: vi.fn(() => '/tmp/fake-dir'),
  resolveApiUrl: vi.fn(() => 'http://localhost:3000'),
}));

vi.mock('../lib/preflight', () => ({
  runPreflight: vi.fn(async () => ({
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
  ramToolingHint: vi.fn((ramGb: number) => ({
    recommendedModel: ramGb < 8 ? 'qwen2.5-coder:1.5b' : 'qwen2.5-coder:7b',
  })),
}));

vi.mock('../lib/dev-env-metrics', () => ({
  incrementWizardCompletion: vi.fn(),
  incrementPresetSelections: vi.fn(),
  recordDevEnvLog: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: Buffer.from('ok'), stderr: Buffer.from('') })),
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
  vi.clearAllMocks();
});

describe('fmx dev-env setup (non-interactive)', () => {
  it('generates configs for copilot + cursor without prompts and writes lock file', async () => {
    const { devEnvCommand } = await import('./dev-env');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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
    expect(vsMcp.servers.fluxomind.type).toBe('http');
    expect(vsMcp.servers.fluxomind.url).toBe('https://platform.fluxomind.com/api/mcp');

    const cursorMcp = JSON.parse(readFileSync(join(workDir, '.cursor/mcp.json'), 'utf-8'));
    expect(cursorMcp.mcpServers.fluxomind.url).toBe('https://platform.fluxomind.com/api/mcp');

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
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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
    expect(cfg.mcpServers[0]).toMatchObject({ type: 'streamable-http', url: 'https://platform.fluxomind.com/api/mcp' });
  });

  it('rejects unknown AI client', async () => {
    const { devEnvCommand } = await import('./dev-env');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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

    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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

    const doctorExit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    global.fetch = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;

    await expect(devEnvCommand.parseAsync(['node', 'fmx', 'doctor'])).rejects.toThrow(/__exit\(0\)/);
    expect(doctorExit).toHaveBeenCalledWith(0);
  });

  it('exits 1 when lock file points to missing config', async () => {
    const { devEnvCommand } = await import('./dev-env');

    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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

    global.fetch = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;

    const doctorExit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit(${code ?? 0})`);
    }) as never);

    await expect(devEnvCommand.parseAsync(['node', 'fmx', 'doctor'])).rejects.toThrow(/__exit\(1\)/);
    expect(doctorExit).toHaveBeenCalledWith(1);
  });
});

describe('remote MCP configuration', () => {
  it('generated configs point to the remote MCP endpoint', async () => {
    const { devEnvCommand } = await import('./dev-env');
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
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
      expect(entry).toMatchObject({ url: 'https://platform.fluxomind.com/api/mcp' });
      expect(entry).not.toHaveProperty('command');
    }
  });
});
