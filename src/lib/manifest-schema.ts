/**
 * Manifest Schema — cópia canônica sincronizada com o monorepo interno
 * (`@/engine/codeEngine/manifest.extensionManifestSchema`).
 *
 * EVO-394 D12 (CA-18): CLI @fluxomind/cli é standalone (sem acesso cross-repo
 * em runtime); sync é VIA RELEASE PROCESS — a cada versão do MONO que mudar
 * o schema, bumpar esta cópia em sincronia e release conjunta.
 *
 * NÃO editar manualmente sem alinhar com o monorepo. Ver `docs/schema-sync.md`.
 *
 * Current sync: monorepo commit `857d356df` (EVO-394 Wave 2 MONO) — 2026-04-22
 *
 * @package @fluxomind/cli
 * @module manifest-schema
 */

// Minimal structural descriptor (Zod-equivalent, sem dep externa)
// Atualizar quando monorepo `src/engine/codeEngine/manifest/schema.ts` mudar.
export interface ManifestDescriptor {
  name: string;
  version: string; // semver
  description?: string;
  permissions?: Record<string, string[]>;
  triggers?: Array<Record<string, unknown>>;
  targets?: Array<Record<string, unknown>>;
  connectors?: Array<Record<string, unknown>>;
  repository?: {
    url: string;
    host: string;
  };
}

export const REQUIRED_FIELDS: Array<keyof ManifestDescriptor> = ['name', 'version'];

export const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

/**
 * Validates a parsed manifest object against the canonical schema.
 * Returns structural errors per line/field when invalid.
 */
export function validateManifestDescriptor(manifest: unknown): {
  valid: boolean;
  errors: string[];
  normalized?: ManifestDescriptor;
} {
  const errors: string[] = [];
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['manifest root must be an object'] };
  }

  const m = manifest as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!m[field]) errors.push(`missing required field: ${field}`);
  }

  if (m.version && typeof m.version === 'string' && !SEMVER_REGEX.test(m.version)) {
    errors.push(`invalid version "${m.version}": must be semver (e.g., 1.0.0)`);
  }

  if (m.name && typeof m.name === 'string' && !/^[a-z][a-z0-9-]*$/.test(m.name)) {
    errors.push(`invalid name "${m.name}": must be kebab-case (lowercase + hyphens)`);
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    normalized: m as unknown as ManifestDescriptor,
  };
}
