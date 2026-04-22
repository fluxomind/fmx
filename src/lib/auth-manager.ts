/**
 * Auth Manager — token storage (AES-256-GCM) inside ~/.fmx/config.json
 *
 * Path unificado conforme playbook `profile-dev.md §2.1` e EVO-394 D-NEW-1:
 * um unico arquivo `~/.fmx/config.json` com campo `auth` contendo blob
 * encrypted (StoredAuth). Consumers continuam chamando os mesmos helpers.
 *
 * @package @fluxomind/cli
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { hostname, homedir } from 'os';
import { join } from 'path';
import { loadConfig, saveConfig } from './config-manager';

const LEGACY_AUTH_JSON_PATH = join(homedir(), '.fmx', 'auth.json');

export interface TenantAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
}

interface StoredAuth {
  tenants: Record<string, TenantAuth>;
}

const ALGORITHM = 'aes-256-gcm';

function deriveKey(): Buffer {
  const machineId = `fmx-${hostname()}-${process.env.USER ?? 'default'}`;
  return createHash('sha256').update(machineId).digest();
}

function encrypt(data: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(data: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, encHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
}

function loadAuthStore(): StoredAuth {
  const config = loadConfig();
  if (config.auth) {
    try {
      const decrypted = decrypt(config.auth);
      return JSON.parse(decrypted) as StoredAuth;
    } catch {
      return { tenants: {} };
    }
  }

  // EVO-394 CA-17: fallback gracioso para early adopter com ~/.fmx/auth.json legacy.
  // Leitura apenas — migration real é via `fmx auth migrate`.
  if (existsSync(LEGACY_AUTH_JSON_PATH)) {
    try {
      // eslint-disable-next-line no-console
      console.error(
        '[DEPRECATION] Reading ~/.fmx/auth.json (legacy). Run `fmx auth migrate` to consolidate.',
      );
      const raw = readFileSync(LEGACY_AUTH_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoredAuth;
      return parsed.tenants ? parsed : { tenants: {} };
    } catch {
      return { tenants: {} };
    }
  }

  return { tenants: {} };
}

function saveAuthStore(store: StoredAuth): void {
  const config = loadConfig();
  config.auth = encrypt(JSON.stringify(store));
  saveConfig(config);
}

export function saveTokens(tenant: string, tokens: TenantAuth): void {
  const store = loadAuthStore();
  store.tenants[tenant] = tokens;
  saveAuthStore(store);
}

export function getAuthToken(tenant?: string): string | null {
  const store = loadAuthStore();
  const key = tenant ?? Object.keys(store.tenants)[0];
  if (!key) return null;
  const auth = store.tenants[key];
  if (!auth) return null;
  if (auth.expiresAt && Date.now() > auth.expiresAt) return null;
  return auth.accessToken;
}

export function getStoredTenants(): string[] {
  return Object.keys(loadAuthStore().tenants);
}

export function getTenantAuth(tenant: string): TenantAuth | null {
  const store = loadAuthStore();
  return store.tenants[tenant] ?? null;
}

export function getAuthStatus(tenant?: string): {
  authenticated: boolean;
  email?: string;
  tenant?: string;
  expiresAt?: number;
} {
  const store = loadAuthStore();
  const key = tenant ?? Object.keys(store.tenants)[0];
  if (!key) return { authenticated: false };
  const auth = store.tenants[key];
  if (!auth) return { authenticated: false };
  return {
    authenticated: true,
    email: auth.email,
    tenant: key,
    expiresAt: auth.expiresAt,
  };
}

/**
 * EVO-394 CA-1 + CA-17: detects ~/.fmx/auth.json legacy file and consolidates
 * into the unified ~/.fmx/config.json (under `config.auth`). Idempotent.
 *
 * Emits deprecation stderr + structured counter log `auth.path.legacy_detected`
 * for opt-in telemetry.
 *
 * @returns migration outcome
 */
export interface MigrationOutcome {
  migrated: boolean;
  tenantsConsolidated: number;
  legacyRemoved: boolean;
  reason?: string;
}

export function migrateLegacyAuthJson(options: { removeLegacy?: boolean } = {}): MigrationOutcome {
  if (!existsSync(LEGACY_AUTH_JSON_PATH)) {
    return { migrated: false, tenantsConsolidated: 0, legacyRemoved: false, reason: 'no legacy file' };
  }

  // eslint-disable-next-line no-console
  console.error(
    '[DEPRECATION] ~/.fmx/auth.json detected (legacy format). Consolidating into ~/.fmx/config.json.',
  );
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: 'auth.path.legacy_detected', count: 1 }));

  let legacyPayload: StoredAuth;
  try {
    const raw = readFileSync(LEGACY_AUTH_JSON_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoredAuth;
    legacyPayload = parsed.tenants ? parsed : { tenants: {} };
  } catch (err) {
    return {
      migrated: false,
      tenantsConsolidated: 0,
      legacyRemoved: false,
      reason: `failed to parse legacy auth.json: ${(err as Error).message}`,
    };
  }

  const current = loadAuthStore();
  const merged: StoredAuth = {
    tenants: { ...legacyPayload.tenants, ...current.tenants },
  };
  saveAuthStore(merged);

  let legacyRemoved = false;
  if (options.removeLegacy !== false) {
    try {
      unlinkSync(LEGACY_AUTH_JSON_PATH);
      legacyRemoved = true;
    } catch {
      // keep going — removal is best-effort
    }
  }

  return {
    migrated: true,
    tenantsConsolidated: Object.keys(legacyPayload.tenants).length,
    legacyRemoved,
  };
}

export function clearAuth(tenant?: string): void {
  const config = loadConfig();
  if (!tenant) {
    delete config.auth;
    saveConfig(config);
    return;
  }
  const store = loadAuthStore();
  delete store.tenants[tenant];
  if (Object.keys(store.tenants).length === 0) {
    delete config.auth;
    saveConfig(config);
  } else {
    saveAuthStore(store);
  }
}
