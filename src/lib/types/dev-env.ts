/**
 * Types for the `fmx dev-env` wizard — preset selection, lock file, preflight result.
 * @package @fluxomind/cli
 */

export type AiClient =
  | 'copilot'
  | 'continue-ollama'
  | 'continue-anthropic'
  | 'claude-code'
  | 'cursor';

export const ALL_AI_CLIENTS: readonly AiClient[] = [
  'copilot',
  'continue-ollama',
  'continue-anthropic',
  'claude-code',
  'cursor',
] as const;

export type PresetVersion = '1.0';

export const CURRENT_PRESET_VERSION: PresetVersion = '1.0';

export interface DevEnvLockFile {
  presetVersion: PresetVersion;
  installedAt: string;
  aiClients: AiClient[];
  gitConnected: boolean;
  configHashes: Record<string, string>;
}

export interface PreflightVersion {
  version: string | null;
  raw: string | null;
  ok: boolean;
}

export interface PreflightResult {
  node: PreflightVersion;
  npm: PreflightVersion;
  git: PreflightVersion;
  deno: PreflightVersion;
  ollama: PreflightVersion;
  ramGb: number;
  abort: boolean;
  blockers: string[];
  warnings: string[];
}

export interface MergeResult {
  path: string;
  action: 'created' | 'merged' | 'overwritten' | 'skipped';
  addedKeys: string[];
  conflicts: string[];
}

export interface DriftReport {
  drifted: string[];
  missing: string[];
  unchanged: string[];
}

export type MergeStrategy = 'merge' | 'overwrite' | 'skip';

export interface SetupOptions {
  force: boolean;
  skipSmoke: boolean;
  aiClients?: AiClient[];
}
