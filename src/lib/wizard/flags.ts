/**
 * Parse non-interactive flags for the `dev-env setup` wizard.
 * @package @fluxomind/cli
 */

import type { AiClient } from '../types/dev-env';
import { ALL_AI_CLIENTS } from '../types/dev-env';

const VALID: ReadonlySet<string> = new Set<string>(ALL_AI_CLIENTS);

export function parseAiClientsCsv(csv: string | undefined): AiClient[] {
  if (!csv) return [];
  const parts = csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const unknown = parts.filter((p) => !VALID.has(p));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown AI client(s): ${unknown.join(', ')}. Valid: ${ALL_AI_CLIENTS.join(', ')}.`,
    );
  }

  const deduped = Array.from(new Set(parts)) as AiClient[];
  if (deduped.length === 0) {
    throw new Error('--ai-clients cannot be empty after deduplication.');
  }
  return deduped;
}
