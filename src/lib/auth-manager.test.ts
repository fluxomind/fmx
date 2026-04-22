/**
 * Tests for auth-manager — consolidação e migration legacy (EVO-394 CA-1 + CA-17).
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const FAKE_HOME = join(tmpdir(), `fmx-test-home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const FAKE_FMX_DIR = join(FAKE_HOME, '.fmx');
const FAKE_LEGACY_AUTH_PATH = join(FAKE_FMX_DIR, 'auth.json');

// Mock os.homedir and os.hostname globally before any import resolves them.
jest.mock('os', () => {
  const actual = jest.requireActual('os');
  return {
    ...actual,
    homedir: () => FAKE_HOME,
    hostname: () => 'test-host',
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
  jest.resetModules();
});

describe('auth-manager — EVO-394 migration (legacy auth.json → config.json)', () => {
  it('fresh state: no legacy file, no config.auth → empty store', async () => {
    const mod = await import('./auth-manager');
    expect(mod.getStoredTenants()).toEqual([]);
  });

  it('legacy-only: auth.json present, config.auth absent → fallback read + deprecation stderr', async () => {
    writeFileSync(
      FAKE_LEGACY_AUTH_PATH,
      JSON.stringify({
        tenants: {
          'tenant-a': { accessToken: 'token-A', email: 'a@example.com' },
        },
      }),
      'utf-8',
    );

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mod = await import('./auth-manager');

    const tenants = mod.getStoredTenants();
    expect(tenants).toContain('tenant-a');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[DEPRECATION]'));

    errSpy.mockRestore();
  });

  it('unified: saveTokens encrypts into config.auth; no legacy file created', async () => {
    const mod = await import('./auth-manager');
    mod.saveTokens('tenant-b', { accessToken: 'token-B', email: 'b@example.com' });

    expect(existsSync(FAKE_LEGACY_AUTH_PATH)).toBe(false);
    expect(mod.getStoredTenants()).toContain('tenant-b');
  });

  it('migration: auth.json + empty config → migrateLegacyAuthJson consolidates + removes legacy', async () => {
    writeFileSync(
      FAKE_LEGACY_AUTH_PATH,
      JSON.stringify({
        tenants: {
          'tenant-c': { accessToken: 'token-C' },
          'tenant-d': { accessToken: 'token-D' },
        },
      }),
      'utf-8',
    );

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mod = await import('./auth-manager');

    const outcome = mod.migrateLegacyAuthJson();

    expect(outcome.migrated).toBe(true);
    expect(outcome.tenantsConsolidated).toBe(2);
    expect(outcome.legacyRemoved).toBe(true);
    expect(existsSync(FAKE_LEGACY_AUTH_PATH)).toBe(false);

    const tenants = mod.getStoredTenants();
    expect(tenants).toEqual(expect.arrayContaining(['tenant-c', 'tenant-d']));

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[DEPRECATION]'));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('auth.path.legacy_detected'));

    errSpy.mockRestore();
  });

  it('migration idempotent: no legacy exists → returns migrated=false', async () => {
    const mod = await import('./auth-manager');
    const outcome = mod.migrateLegacyAuthJson();
    expect(outcome.migrated).toBe(false);
    expect(outcome.reason).toBe('no legacy file');
  });

  it('migration with --keep-legacy preserves auth.json', async () => {
    writeFileSync(
      FAKE_LEGACY_AUTH_PATH,
      JSON.stringify({ tenants: { 'tenant-e': { accessToken: 'token-E' } } }),
      'utf-8',
    );

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mod = await import('./auth-manager');

    const outcome = mod.migrateLegacyAuthJson({ removeLegacy: false });
    expect(outcome.migrated).toBe(true);
    expect(outcome.legacyRemoved).toBe(false);
    expect(existsSync(FAKE_LEGACY_AUTH_PATH)).toBe(true);

    errSpy.mockRestore();
  });
});
