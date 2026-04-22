/**
 * `fmx dev-env` — interactive setup + non-mutating doctor for local AI-assisted dev.
 *
 * Two subcommands:
 *   fmx dev-env setup  — preflight → auth check → pick AI clients → generate configs → smoke test
 *   fmx dev-env doctor — validate environment without touching files
 *
 * @package @fluxomind/cli
 */

import { Command } from 'commander';
import { copyFileSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { getAuthStatus } from '../lib/auth-manager';
import { loadConfig } from '../lib/config-manager';
import { runPreflight } from '../lib/preflight';
import {
  computeConfigHash,
  detectDrift,
  getLockFilePath,
  mergeJsonConfig,
  readLockFile,
  writeLockFile,
} from '../lib/config-merger';
import { askAiClients, askGitConnect, askMergeStrategy, askOllamaModel } from '../lib/wizard/prompts';
import { parseAiClientsCsv } from '../lib/wizard/flags';
import {
  generateVscodeMcpJson,
  generateVscodeSettings,
  generateVscodeExtensionsRecommendations,
} from '../lib/config-generators/vscode';
import { generateCursorMcpJson } from '../lib/config-generators/cursor';
import { generateProjectMcpJson, generateClaudeSettings } from '../lib/config-generators/claude-code';
import {
  generateContinueOllamaConfig,
  generateContinueAnthropicConfig,
} from '../lib/config-generators/continue';
import { success, error, info, warn, bold, dim } from '../lib/output';
import type { AiClient, DevEnvLockFile, MergeResult, SetupOptions } from '../lib/types/dev-env';
import { CURRENT_PRESET_VERSION } from '../lib/types/dev-env';
import {
  recordDevEnvLog,
  incrementPresetSelections,
  incrementWizardCompletion,
} from '../lib/dev-env-metrics';

const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates', 'dev-env');
const SMOKE_TIMEOUT_MS = 30_000;

interface ConfigPlanEntry {
  relPath: string;
  content: Record<string, unknown>;
  clientOwner: AiClient;
}

function planConfigsForClients(clients: AiClient[], ollamaModel: string): ConfigPlanEntry[] {
  const plan: ConfigPlanEntry[] = [];
  const vscodeClients = clients.filter((c) => c !== 'cursor' && c !== 'claude-code');

  if (vscodeClients.length > 0) {
    plan.push({
      relPath: '.vscode/mcp.json',
      content: generateVscodeMcpJson(),
      clientOwner: vscodeClients[0],
    });
    plan.push({
      relPath: '.vscode/settings.json',
      content: generateVscodeSettings(),
      clientOwner: vscodeClients[0],
    });
    plan.push({
      relPath: '.vscode/extensions.json',
      content: generateVscodeExtensionsRecommendations(clients),
      clientOwner: vscodeClients[0],
    });
  }

  if (clients.includes('cursor')) {
    plan.push({
      relPath: '.cursor/mcp.json',
      content: generateCursorMcpJson(),
      clientOwner: 'cursor',
    });
  }

  if (clients.includes('claude-code')) {
    plan.push({
      relPath: '.mcp.json',
      content: generateProjectMcpJson(),
      clientOwner: 'claude-code',
    });
    plan.push({
      relPath: '.claude/settings.json',
      content: generateClaudeSettings(),
      clientOwner: 'claude-code',
    });
  }

  if (clients.includes('continue-ollama')) {
    plan.push({
      relPath: '.continue/config.json',
      content: generateContinueOllamaConfig({ model: ollamaModel }),
      clientOwner: 'continue-ollama',
    });
  } else if (clients.includes('continue-anthropic')) {
    plan.push({
      relPath: '.continue/config.json',
      content: generateContinueAnthropicConfig(),
      clientOwner: 'continue-anthropic',
    });
  }

  return plan.map((e) => ({ ...e, relPath: e.relPath }));
}

async function resolveMergeStrategy(
  absPath: string,
  force: boolean,
  interactive: boolean,
): Promise<'merge' | 'overwrite' | 'skip' | 'create'> {
  if (!existsSync(absPath)) return 'create';
  if (force) return 'overwrite';
  if (!interactive) return 'merge';
  return askMergeStrategy(absPath);
}

function appendGitignoreEntry(workspaceDir: string): void {
  const gitDir = join(workspaceDir, '.git');
  if (!existsSync(gitDir)) return;
  const gitignore = join(workspaceDir, '.gitignore');
  const entry = '.fluxomind/';
  if (existsSync(gitignore)) {
    const current = readFileSync(gitignore, 'utf-8');
    if (!current.split(/\r?\n/).includes(entry)) {
      appendFileSync(gitignore, (current.endsWith('\n') ? '' : '\n') + `${entry}\n`);
      info('Added .fluxomind/ to .gitignore');
    }
  } else {
    writeFileSync(gitignore, `${entry}\n`);
    info('Created .gitignore with .fluxomind/ entry');
  }
}

function copyReadmeDev(workspaceDir: string): void {
  const src = join(TEMPLATES_DIR, 'README-dev.md');
  const dest = join(workspaceDir, 'README-dev.md');
  if (!existsSync(src)) return;
  if (existsSync(dest)) return;
  copyFileSync(src, dest);
  info('Wrote README-dev.md with next-step instructions');
}

async function ensureAuthenticated(): Promise<{ tenant: string; email?: string } | null> {
  const status = getAuthStatus();
  if (status.authenticated && status.tenant) {
    info(`Authenticated as ${status.email ?? 'unknown'} · tenant ${status.tenant}`);
    return { tenant: status.tenant, email: status.email };
  }
  warn('Not authenticated. Run `fmx auth login` and retry `fmx dev-env setup`.');
  return null;
}

async function runSmokeTest(workspaceDir: string): Promise<{ ok: boolean; elapsedMs: number; message: string }> {
  const start = Date.now();
  const init = spawnSync('fmx', ['init', 'demo-extension', '--template', 'extension'], {
    cwd: workspaceDir,
    stdio: 'pipe',
    timeout: SMOKE_TIMEOUT_MS / 2,
  });
  if (init.status !== 0) {
    return {
      ok: false,
      elapsedMs: Date.now() - start,
      message: `fmx init failed: ${init.stderr?.toString() ?? 'unknown error'}`,
    };
  }
  const deploy = spawnSync('fmx', ['deploy'], {
    cwd: join(workspaceDir, 'demo-extension'),
    stdio: 'pipe',
    timeout: SMOKE_TIMEOUT_MS / 2,
  });
  const elapsedMs = Date.now() - start;
  if (deploy.status !== 0) {
    return {
      ok: false,
      elapsedMs,
      message: `fmx deploy failed: ${deploy.stderr?.toString() ?? 'unknown error'}`,
    };
  }
  return { ok: true, elapsedMs, message: 'demo-extension deployed successfully' };
}

async function runSetup(options: SetupOptions, workspaceDir: string): Promise<void> {
  const startedAt = Date.now();
  const interactive = options.aiClients === undefined;

  console.log(bold('\nFluxomind dev-env setup\n'));

  const preflight = await runPreflight();
  for (const blocker of preflight.blockers) error(blocker);
  for (const w of preflight.warnings) warn(w);
  if (preflight.abort) {
    incrementWizardCompletion('none', 'aborted');
    process.exit(1);
  }
  success(`Node ${preflight.node.version} · npm ${preflight.npm.version} · RAM ${preflight.ramGb}GB`);

  const auth = await ensureAuthenticated();
  if (!auth) {
    incrementWizardCompletion('none', 'aborted');
    process.exit(1);
  }

  const clients: AiClient[] = options.aiClients ?? (await askAiClients());
  if (clients.length === 0) {
    error('No AI clients selected. Aborting.');
    incrementWizardCompletion('none', 'aborted');
    process.exit(1);
  }
  for (const client of clients) incrementPresetSelections(client);

  let ollamaModel = 'qwen2.5-coder:7b';
  if (clients.includes('continue-ollama')) {
    if (!preflight.ollama.ok) {
      warn('Ollama not detected — install from https://ollama.com before Continue.dev can talk to it.');
    }
    if (interactive) ollamaModel = await askOllamaModel(preflight.ramGb);
  }

  let gitConnected = false;
  if (interactive && preflight.git.ok) {
    gitConnected = await askGitConnect();
    if (gitConnected) {
      info('Run `fmx auth github` separately to finish Git setup — skipping inline OAuth.');
    }
  }

  const plan = planConfigsForClients(clients, ollamaModel);
  const mergeResults: MergeResult[] = [];

  for (const entry of plan) {
    const absPath = join(workspaceDir, entry.relPath);
    const strategy = await resolveMergeStrategy(absPath, options.force, interactive);
    if (strategy === 'skip') {
      info(`Skipped ${entry.relPath}`);
      mergeResults.push({ path: absPath, action: 'skipped', addedKeys: [], conflicts: [] });
      continue;
    }
    const result = mergeJsonConfig(absPath, entry.content, strategy === 'create' ? 'merge' : strategy);
    mergeResults.push(result);
    const verb = result.action === 'created' ? 'Created' : result.action === 'merged' ? 'Merged' : 'Overwrote';
    success(`${verb} ${entry.relPath}`);
    if (result.conflicts.length > 0) {
      warn(`  Conflicts preserved (your values kept): ${result.conflicts.join(', ')}`);
    }
  }

  const configHashes: Record<string, string> = {};
  for (const entry of plan) {
    const hash = computeConfigHash(join(workspaceDir, entry.relPath));
    if (hash) configHashes[entry.relPath] = hash;
  }

  const lock: DevEnvLockFile = {
    presetVersion: CURRENT_PRESET_VERSION,
    installedAt: new Date().toISOString(),
    aiClients: clients,
    gitConnected,
    configHashes,
  };
  writeLockFile(workspaceDir, lock);
  success(`Wrote ${getLockFilePath(workspaceDir).replace(workspaceDir + '/', '')}`);

  appendGitignoreEntry(workspaceDir);
  copyReadmeDev(workspaceDir);

  let smokeOutcome: 'success' | 'smoke_failed' | 'aborted' = 'success';
  let smokeElapsedMs: number | null = null;
  if (!options.skipSmoke) {
    info('Running smoke test: fmx init demo-extension && fmx deploy...');
    const smoke = await runSmokeTest(workspaceDir);
    smokeElapsedMs = smoke.elapsedMs;
    if (smoke.ok) {
      success(`Deploy in ${(smoke.elapsedMs / 1000).toFixed(1)}s · ${smoke.message}`);
    } else {
      smokeOutcome = 'smoke_failed';
      warn(`Smoke test failed: ${smoke.message}`);
      warn('Run `fmx dev-env doctor` to diagnose, then retry manually: fmx init demo-extension && fmx deploy');
    }
  }

  const totalMs = Date.now() - startedAt;
  const presetKey = clients.sort().join(',');
  incrementWizardCompletion(presetKey, smokeOutcome);

  recordDevEnvLog({
    op: 'cli.dev-env.setup',
    preset: presetKey,
    aiClients: clients,
    durationMs: totalMs,
    outcome: smokeOutcome,
    gitConnected,
    smokeElapsedMs,
  });

  console.log('');
  console.log(bold(`Deploy em ${smokeElapsedMs != null ? (smokeElapsedMs / 1000).toFixed(1) + 's' : '—'} · Total wizard em ${(totalMs / 1000).toFixed(1)}s`));
  console.log(dim('Next: open this folder in your IDE and read README-dev.md'));
}

interface DoctorCheck {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
}

async function pingMcpApi(apiBase: string): Promise<boolean> {
  try {
    const url = `${apiBase.replace(/\/$/, '')}/api/health`;
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function runDoctor(workspaceDir: string): Promise<number> {
  console.log(bold('\nFluxomind dev-env doctor\n'));
  const checks: DoctorCheck[] = [];
  const preflight = await runPreflight();

  checks.push({
    name: `Node ${preflight.node.version ?? '—'}`,
    status: preflight.node.ok ? 'ok' : 'error',
    detail: preflight.node.ok ? 'OK' : 'Node >= 18 required',
  });
  checks.push({
    name: `npm ${preflight.npm.version ?? '—'}`,
    status: preflight.npm.ok ? 'ok' : 'error',
    detail: preflight.npm.ok ? 'OK' : 'Reinstall Node to restore npm',
  });
  checks.push({
    name: `git ${preflight.git.version ?? 'missing'}`,
    status: preflight.git.ok ? 'ok' : 'warn',
    detail: preflight.git.ok ? 'OK' : 'git optional — install for repo deploys',
  });
  checks.push({
    name: `ollama ${preflight.ollama.version ?? 'missing'}`,
    status: preflight.ollama.ok ? 'ok' : 'warn',
    detail: preflight.ollama.ok ? 'OK' : 'Install ollama to enable Continue.dev + Ollama preset',
  });

  const authStatus = getAuthStatus();
  checks.push({
    name: 'Auth',
    status: authStatus.authenticated ? 'ok' : 'error',
    detail: authStatus.authenticated
      ? `Authenticated as ${authStatus.email ?? 'unknown'} · tenant ${authStatus.tenant ?? 'unknown'}`
      : 'Not authenticated — run `fmx auth login`',
  });

  const config = loadConfig();
  const apiReachable = await pingMcpApi(config.apiBaseUrl);
  checks.push({
    name: 'Platform API',
    status: apiReachable ? 'ok' : 'warn',
    detail: apiReachable ? `${config.apiBaseUrl} reachable` : `${config.apiBaseUrl} unreachable`,
  });

  const lock = readLockFile(workspaceDir);
  if (!lock) {
    checks.push({
      name: 'dev-env.lock.json',
      status: 'warn',
      detail: 'No lock file — run `fmx dev-env setup`',
    });
  } else {
    if (lock.presetVersion !== CURRENT_PRESET_VERSION) {
      checks.push({
        name: `Preset version ${lock.presetVersion}`,
        status: 'error',
        detail: `Lock is v${lock.presetVersion}, CLI expects v${CURRENT_PRESET_VERSION} — re-run setup`,
      });
    }
    const drift = detectDrift(workspaceDir, lock);
    for (const file of drift.missing) {
      checks.push({ name: file, status: 'error', detail: 'Missing — re-run setup' });
    }
    for (const file of drift.drifted) {
      checks.push({ name: file, status: 'warn', detail: 'Edited since setup (drift)' });
    }
    for (const file of drift.unchanged) {
      checks.push({ name: file, status: 'ok', detail: 'Unchanged since setup' });
    }
  }

  for (const c of checks) {
    if (c.status === 'ok') success(`${c.name} — ${c.detail}`);
    else if (c.status === 'warn') warn(`${c.name} — ${c.detail}`);
    else error(`${c.name} — ${c.detail}`);
  }

  const hasError = checks.some((c) => c.status === 'error');
  return hasError ? 1 : 0;
}

interface SetupCliOptions {
  force?: boolean;
  skipSmoke?: boolean;
  aiClients?: string;
}

export const devEnvCommand = new Command('dev-env').description(
  'Configure local development environment (multi-IDE + AI clients + MCP)',
);

devEnvCommand
  .command('setup')
  .description('Wizard: preflight → auth → pick AI clients → generate configs → smoke test')
  .option('--force', 'Overwrite existing configs without prompting')
  .option('--skip-smoke', 'Skip the final fmx init + deploy smoke test')
  .option('--ai-clients <csv>', 'CI-friendly non-interactive mode — e.g. copilot,claude-code')
  .action(async (opts: SetupCliOptions) => {
    try {
      const parsed = parseAiClientsCsv(opts.aiClients);
      const options: SetupOptions = {
        force: opts.force ?? false,
        skipSmoke: opts.skipSmoke ?? false,
        aiClients: parsed.length > 0 ? parsed : undefined,
      };
      await runSetup(options, process.cwd());
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });

devEnvCommand
  .command('doctor')
  .description('Validate environment without modifying files (idempotent)')
  .action(async () => {
    const exitCode = await runDoctor(process.cwd());
    process.exit(exitCode);
  });
