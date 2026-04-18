/**
 * Observability helpers for `fmx dev-env` — structured JSON logs + fire-and-forget
 * Prometheus counter emission to /api/metrics/ingest.
 *
 * PII hygiene: never log tokens or email addresses. Only wizard-level counters.
 *
 * @package @fluxomind/cli
 */

import { loadConfig } from './config-manager';
import type { AiClient } from './types/dev-env';

export type WizardOutcome = 'success' | 'aborted' | 'smoke_failed';

const METRICS_ENDPOINT = '/api/metrics/ingest';

interface CounterPayload {
  name: string;
  labels: Record<string, string>;
  value: number;
}

function emitCounterFireAndForget(payload: CounterPayload): void {
  if (process.env.FLUXOMIND_DISABLE_METRICS === '1') return;
  try {
    const config = loadConfig();
    const url = `${config.apiBaseUrl.replace(/\/$/, '')}${METRICS_ENDPOINT}`;
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: [payload] }),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => {
      // Silent — metrics are fire-and-forget and must not block the wizard.
    });
  } catch {
    // Swallow — metrics MUST NOT break the wizard path.
  }
}

export function incrementWizardCompletion(preset: string, outcome: WizardOutcome): void {
  emitCounterFireAndForget({
    name: 'fluxomind_devenv_wizard_completions_total',
    labels: { preset, outcome },
    value: 1,
  });
}

export function incrementPresetSelections(preset: AiClient): void {
  emitCounterFireAndForget({
    name: 'fluxomind_devenv_preset_selections_total',
    labels: { preset },
    value: 1,
  });
}

export interface DevEnvLogEntry {
  op: string;
  preset: string;
  aiClients: AiClient[];
  durationMs: number;
  outcome: WizardOutcome;
  gitConnected: boolean;
  smokeElapsedMs: number | null;
}

export function recordDevEnvLog(entry: DevEnvLogEntry): void {
  const safe = {
    ts: new Date().toISOString(),
    level: entry.outcome === 'success' ? 'info' : 'warn',
    ...entry,
  };
  process.stderr.write(`${JSON.stringify(safe)}\n`);
}
