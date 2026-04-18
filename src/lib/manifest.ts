/**
 * Manifest Parser — local TOML validation for fail-fast before upload
 * @package @fluxomind/cli
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  manifest?: ParsedManifest;
}

export interface ParsedManifest {
  name: string;
  version: string;
  description?: string;
  permissions?: Record<string, string[]>;
  triggers?: Array<Record<string, unknown>>;
  targets?: Array<Record<string, unknown>>;
  connectors?: Array<Record<string, unknown>>;
}

export function findManifest(dir: string): string | null {
  const path = join(dir, 'manifest.toml');
  return existsSync(path) ? path : null;
}

export function validateManifestLocal(dir: string): ManifestValidation {
  const manifestPath = findManifest(dir);
  if (!manifestPath) {
    return { valid: false, errors: ['manifest.toml not found in project root'] };
  }

  const content = readFileSync(manifestPath, 'utf-8');
  const errors: string[] = [];

  // Basic structural validation (full Zod validation happens server-side)
  if (!content.includes('[extension]')) {
    errors.push('Missing [extension] section in manifest.toml');
  }

  const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
  if (!nameMatch) {
    errors.push('Missing or invalid "name" field in [extension]');
  }

  const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
  if (!versionMatch) {
    errors.push('Missing or invalid "version" field in [extension]');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    manifest: {
      name: nameMatch![1],
      version: versionMatch![1],
    },
  };
}
