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

const DEFAULT_CONFIG: FmxConfig = {
  apiBaseUrl: 'http://localhost:3000',
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
