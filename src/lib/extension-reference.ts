import { validateManifestLocal } from './manifest';

/** Resolve an explicit project reference or the canonical manifest api name. Never emits `current`. */
export function resolveExtensionReference(explicit?: string, cwd: string = process.cwd()): string {
  const normalized = explicit?.trim();
  if (normalized === 'current') {
    throw new Error('The ambiguous extension reference "current" is not supported; pass an extension ID or name.');
  }
  if (normalized) return normalized;

  const manifest = validateManifestLocal(cwd);
  if (manifest.valid && manifest.manifest?.name) return manifest.manifest.name;

  throw new Error(
    'Extension reference required: pass an extension ID/name or run inside a directory with fluxomind.extension.toml.',
  );
}
