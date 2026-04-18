/**
 * Preflight — verify host tooling before running the `dev-env` wizard.
 * @package @fluxomind/cli
 */

import { exec } from 'child_process';
import { totalmem } from 'os';
import type { PreflightResult, PreflightVersion } from './types/dev-env';

const EXEC_TIMEOUT_MS = 2_000;
const NODE_MIN_MAJOR = 18;

interface ToolSpec {
  name: string;
  command: string;
  required: boolean;
  minMajor?: number;
}

const TOOLS: ToolSpec[] = [
  { name: 'node', command: 'node --version', required: true, minMajor: NODE_MIN_MAJOR },
  { name: 'npm', command: 'npm --version', required: true },
  { name: 'git', command: 'git --version', required: false },
  { name: 'deno', command: 'deno --version', required: false },
  { name: 'ollama', command: 'ollama --version', required: false },
];

const VERSION_REGEX = /(\d+)\.(\d+)(?:\.(\d+))?/;

function parseVersion(raw: string): { version: string | null; major: number | null } {
  const match = raw.match(VERSION_REGEX);
  if (!match) return { version: null, major: null };
  const [, major, minor, patch] = match;
  return {
    version: patch ? `${major}.${minor}.${patch}` : `${major}.${minor}.0`,
    major: Number.parseInt(major, 10),
  };
}

function probe(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    exec(command, { timeout: EXEC_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        resolve(null);
        return;
      }
      const out = (stdout || stderr || '').trim();
      resolve(out.length > 0 ? out : null);
    });
  });
}

async function probeTool(tool: ToolSpec): Promise<{ result: PreflightVersion; major: number | null }> {
  const raw = await probe(tool.command);
  if (!raw) return { result: { version: null, raw: null, ok: !tool.required }, major: null };
  const { version, major } = parseVersion(raw);
  const ok = version !== null && (!tool.minMajor || (major !== null && major >= tool.minMajor));
  return { result: { version, raw, ok }, major };
}

export async function runPreflight(): Promise<PreflightResult> {
  const [node, npm, git, deno, ollama] = await Promise.all(TOOLS.map(probeTool));
  const ramGb = Math.round(totalmem() / (1024 ** 3));

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!node.result.version) {
    blockers.push('Node.js not detected. Install Node >= 18 from https://nodejs.org');
  } else if (node.major !== null && node.major < NODE_MIN_MAJOR) {
    blockers.push(`Node ${node.result.version} detected. Fluxomind CLI requires Node >= ${NODE_MIN_MAJOR}.`);
  }

  if (!npm.result.version) {
    blockers.push('npm not detected. Reinstall Node.js to get npm.');
  }

  if (!git.result.version) {
    warnings.push('git not detected. Git connection (optional) and deployments from repos will be unavailable.');
  }

  if (!ollama.result.version) {
    warnings.push('ollama not detected. Continue.dev + Ollama preset requires Ollama running locally.');
  }

  return {
    node: node.result,
    npm: npm.result,
    git: git.result,
    deno: deno.result,
    ollama: ollama.result,
    ramGb,
    abort: blockers.length > 0,
    blockers,
    warnings,
  };
}

export function ramToolingHint(ramGb: number): { recommendedModel: string; warning?: string } {
  if (ramGb < 8) {
    return {
      recommendedModel: 'qwen2.5-coder:1.5b',
      warning: `Only ${ramGb}GB RAM — recommended tiny model. Larger models will swap aggressively.`,
    };
  }
  if (ramGb < 16) {
    return { recommendedModel: 'qwen2.5-coder:7b' };
  }
  return { recommendedModel: 'qwen2.5-coder:14b' };
}
