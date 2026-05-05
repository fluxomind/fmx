/**
 * Tests for resolveApiUrl — precedence flag > env > ~/.fmx/config.json > default.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const FAKE_HOME = join(tmpdir(), `fmx-test-home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const FAKE_FMX_DIR = join(FAKE_HOME, '.fmx');
const FAKE_CONFIG_PATH = join(FAKE_FMX_DIR, 'config.json');

jest.mock('os', () => {
  const actual = jest.requireActual('os');
  return {
    ...actual,
    homedir: () => FAKE_HOME,
  };
});

beforeAll(() => {
  mkdirSync(FAKE_FMX_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(FAKE_HOME)) rmSync(FAKE_HOME, { recursive: true, force: true });
});

beforeEach(() => {
  if (existsSync(FAKE_FMX_DIR)) rmSync(FAKE_FMX_DIR, { recursive: true });
  mkdirSync(FAKE_FMX_DIR, { recursive: true });
  delete process.env.FLUXOMIND_API_URL;
  jest.resetModules();
});

const writeConfigFile = (apiBaseUrl: string): void => {
  writeFileSync(FAKE_CONFIG_PATH, JSON.stringify({ apiBaseUrl, outputFormat: 'text' }), { mode: 0o600 });
};

describe('resolveApiUrl — endpoint precedence', () => {
  it('(a) default puro — sem flag, sem env, sem config file', async () => {
    const { resolveApiUrl, DEFAULT_API_BASE_URL } = await import('./config-manager');
    expect(resolveApiUrl()).toBe(DEFAULT_API_BASE_URL);
    expect(DEFAULT_API_BASE_URL).toBe('https://platform.fluxomind.com');
  });

  it('(b) config file apenas — retorna apiBaseUrl do JSON', async () => {
    writeConfigFile('https://staging.fluxomind.com');
    const { resolveApiUrl } = await import('./config-manager');
    expect(resolveApiUrl()).toBe('https://staging.fluxomind.com');
  });

  it('(c) env var sobrescreve config file', async () => {
    writeConfigFile('https://staging.fluxomind.com');
    process.env.FLUXOMIND_API_URL = 'http://localhost:3000';
    const { resolveApiUrl } = await import('./config-manager');
    expect(resolveApiUrl()).toBe('http://localhost:3000');
  });

  it('(d) flag sobrescreve env var', async () => {
    writeConfigFile('https://staging.fluxomind.com');
    process.env.FLUXOMIND_API_URL = 'http://localhost:3000';
    const { resolveApiUrl } = await import('./config-manager');
    expect(resolveApiUrl('https://override.fluxomind.com')).toBe('https://override.fluxomind.com');
  });

  it('(e) JSON corrupto — fallback para default + warning em stderr', async () => {
    writeFileSync(FAKE_CONFIG_PATH, '{ this is not valid json', { mode: 0o600 });
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { resolveApiUrl, DEFAULT_API_BASE_URL } = await import('./config-manager');
    expect(resolveApiUrl()).toBe(DEFAULT_API_BASE_URL);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    stderrSpy.mockRestore();
  });
});

describe('resolveApiUrl — HTTPS warning', () => {
  it('warns when URL is non-HTTPS and not localhost', async () => {
    process.env.FLUXOMIND_API_URL = 'http://staging.example.com';
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { resolveApiUrl } = await import('./config-manager');
    resolveApiUrl();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('not HTTPS and not localhost'),
    );
    stderrSpy.mockRestore();
  });

  it('does not warn for HTTPS URLs', async () => {
    process.env.FLUXOMIND_API_URL = 'https://example.com';
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { resolveApiUrl } = await import('./config-manager');
    resolveApiUrl();
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('does not warn for localhost', async () => {
    process.env.FLUXOMIND_API_URL = 'http://localhost:3000';
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { resolveApiUrl } = await import('./config-manager');
    resolveApiUrl();
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('does not warn for 127.0.0.1', async () => {
    process.env.FLUXOMIND_API_URL = 'http://127.0.0.1:3000';
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { resolveApiUrl } = await import('./config-manager');
    resolveApiUrl();
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
