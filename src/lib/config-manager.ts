/**
 * Config Manager — ~/.fmx/config.json CRUD (unified auth + general config).
 * @package @fluxomind/cli
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface FmxConfig {
  defaultTenant?: string;
  apiBaseUrl: string;
  outputFormat: 'text' | 'json';
  /** Encrypted blob (AES-256-GCM) containing StoredAuth. Managed by auth-manager. */
  auth?: string;
}

const FMX_DIR = join(homedir(), '.fmx');
const CONFIG_PATH = join(FMX_DIR, 'config.json');

export const DEFAULT_API_BASE_URL = 'https://platform.fluxomind.com';
export const API_URL_ENV_VAR = 'FLUXOMIND_API_URL';

const DEFAULT_CONFIG: FmxConfig = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  outputFormat: 'text',
};

function ensureDir(): void {
  if (!existsSync(FMX_DIR)) {
    mkdirSync(FMX_DIR, { mode: 0o700, recursive: true });
  }
}

export function loadConfig(): FmxConfig {
  ensureDir();
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: FmxConfig): void {
  ensureDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getConfigValue(key: keyof FmxConfig): string | undefined {
  const config = loadConfig();
  const value = config[key];
  return typeof value === 'string' ? value : undefined;
}

export function setConfigValue(key: keyof FmxConfig, value: string): void {
  const config = loadConfig();
  (config as unknown as Record<string, unknown>)[key] = value;
  saveConfig(config);
}

export function getConfigDir(): string {
  return FMX_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function readConfigFileApiUrl(): string | undefined {
  if (!existsSync(CONFIG_PATH)) return undefined;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FmxConfig>;
    return typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : undefined;
  } catch {
    process.stderr.write(
      `[fmx] warning: ${CONFIG_PATH} is not valid JSON — falling back to default apiBaseUrl\n`,
    );
    return undefined;
  }
}

function isLocalHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function warnIfInsecure(url: string): void {
  if (url.startsWith('https://')) return;
  if (isLocalHost(url)) return;
  process.stderr.write(
    `[fmx] warning: apiBaseUrl ${url} is not HTTPS and not localhost — credentials may be sent in cleartext\n`,
  );
}

/**
 * Resolves the active platform API base URL with industry-standard precedence:
 *
 *   1. explicit `flagValue` (e.g. `--api-url https://...`)
 *   2. env var `FLUXOMIND_API_URL`
 *   3. `~/.fmx/config.json` `apiBaseUrl`
 *   4. compile-time default (`https://platform.fluxomind.com`)
 *
 * Emits a stderr warning when the resolved URL is non-HTTPS and not localhost.
 */
export function resolveApiUrl(flagValue?: string): string {
  const envValue = process.env[API_URL_ENV_VAR];
  const url =
    (flagValue && flagValue.length > 0 ? flagValue : undefined) ??
    (envValue && envValue.length > 0 ? envValue : undefined) ??
    readConfigFileApiUrl() ??
    DEFAULT_API_BASE_URL;
  warnIfInsecure(url);
  return url;
}
