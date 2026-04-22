/**
 * Manifest Parser — local TOML validation for fail-fast before upload.
 *
 * EVO-394 CA-4: aceita dois nomes de arquivo durante janela de migração:
 *   - fluxomind.extension.toml (canônico, alinhado com spec-extension-manifest.md)
 *   - manifest.toml            (legacy — emite deprecation stderr)
 *
 * Validação estrutural mínima (Zod completo roda server-side via /api/v1/appstore/submissions).
 *
 * @package @fluxomind/cli
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  manifest?: ParsedManifest;
  /** Filename found on disk — helps callers distinguish canonical vs legacy */
  filename?: string;
}

export interface ParsedManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  engineVersion?: string;
  permissions?: Record<string, string[]>;
  triggers?: Array<Record<string, unknown>>;
  targets?: Array<Record<string, unknown>>;
  connectors?: Array<Record<string, unknown>>;
}

export const CANONICAL_MANIFEST = 'fluxomind.extension.toml';
export const LEGACY_MANIFEST = 'manifest.toml';

/**
 * Locate the manifest file. Prefer the canonical name; fall back to legacy
 * and emit a deprecation warning on stderr if only the legacy is present.
 * Returns `null` if neither exists.
 */
export function findManifest(dir: string): { path: string; filename: string } | null {
  const canonical = join(dir, CANONICAL_MANIFEST);
  if (existsSync(canonical)) {
    return { path: canonical, filename: CANONICAL_MANIFEST };
  }
  const legacy = join(dir, LEGACY_MANIFEST);
  if (existsSync(legacy)) {
    // eslint-disable-next-line no-console
    console.error(
      `[DEPRECATION] Found ${LEGACY_MANIFEST} (legacy). Rename to ${CANONICAL_MANIFEST} — manifest.toml support will be removed in v1.0.0.`,
    );
    return { path: legacy, filename: LEGACY_MANIFEST };
  }
  return null;
}

function extractField(content: string, field: string): string | null {
  const match = content.match(new RegExp(`^\\s*${field}\\s*=\\s*"([^"]*)"`, 'm'));
  return match ? match[1] : null;
}

export function validateManifestLocal(dir: string): ManifestValidation {
  const found = findManifest(dir);
  if (!found) {
    return {
      valid: false,
      errors: [
        `No manifest found: expected ${CANONICAL_MANIFEST} (or ${LEGACY_MANIFEST} legacy) in ${dir}`,
      ],
    };
  }

  const content = readFileSync(found.path, 'utf-8');
  const errors: string[] = [];

  if (!content.includes('[extension]')) {
    errors.push(`Missing [extension] section in ${found.filename}`);
  }

  const name = extractField(content, 'name');
  if (name === null) {
    errors.push('Missing "name" field in [extension]');
  } else if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    errors.push(`"name" must be kebab-case (a-z, 0-9, hyphens); got "${name}"`);
  }

  const version = extractField(content, 'version');
  if (version === null) {
    errors.push('Missing "version" field in [extension]');
  } else if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    errors.push(`"version" must be semver (e.g., 1.0.0 or 1.0.0-alpha.1); got "${version}"`);
  }

  const description = extractField(content, 'description');
  if (description !== null && description.trim().length === 0) {
    errors.push('"description" cannot be empty — describe what this extension does');
  }

  const author = extractField(content, 'author');
  const engineVersion = extractField(content, 'engine_version');

  if (errors.length > 0) {
    return { valid: false, errors, filename: found.filename };
  }

  return {
    valid: true,
    errors: [],
    filename: found.filename,
    manifest: {
      name: name!,
      version: version!,
      ...(description !== null ? { description } : {}),
      ...(author !== null ? { author } : {}),
      ...(engineVersion !== null ? { engineVersion } : {}),
    },
  };
}
