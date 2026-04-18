/**
 * Interactive prompts for the `dev-env setup` wizard.
 *
 * Thin wrapper around @inquirer/prompts so the command layer stays testable —
 * unit tests mock this module rather than the prompt library directly.
 *
 * @package @fluxomind/cli
 */

import { checkbox, confirm, select } from '@inquirer/prompts';
import type { AiClient, MergeStrategy } from '../types/dev-env';
import { ALL_AI_CLIENTS } from '../types/dev-env';
import { ramToolingHint } from '../preflight';

const AI_CLIENT_LABELS: Record<AiClient, string> = {
  copilot: 'VS Code + GitHub Copilot',
  'continue-ollama': 'VS Code + Continue.dev + Ollama (local)',
  'continue-anthropic': 'VS Code + Continue.dev + Anthropic API',
  'claude-code': 'Claude Code CLI',
  cursor: 'Cursor',
};

export async function askAiClients(): Promise<AiClient[]> {
  const selected = await checkbox<AiClient>({
    message: 'Which AI clients do you want to configure?',
    choices: ALL_AI_CLIENTS.map((c) => ({ name: AI_CLIENT_LABELS[c], value: c })),
    required: true,
  });
  return selected;
}

export async function askGitConnect(): Promise<boolean> {
  return confirm({
    message: 'Connect a GitHub account now for repo-based deploys?',
    default: false,
  });
}

export async function askMergeStrategy(filename: string): Promise<MergeStrategy> {
  return select<MergeStrategy>({
    message: `${filename} already exists. How should we handle it?`,
    choices: [
      { name: 'merge (add missing keys, preserve your values)', value: 'merge' },
      { name: 'overwrite (replace with Fluxomind defaults)', value: 'overwrite' },
      { name: 'skip (leave untouched)', value: 'skip' },
    ],
    default: 'merge',
  });
}

export async function askOllamaModel(ramGb: number): Promise<string> {
  const hint = ramToolingHint(ramGb);
  const choices = [
    { name: 'qwen2.5-coder:1.5b — 4GB RAM · autocomplete only', value: 'qwen2.5-coder:1.5b' },
    { name: 'qwen2.5-coder:7b — 8GB RAM · chat + autocomplete (recommended)', value: 'qwen2.5-coder:7b' },
    { name: 'qwen2.5-coder:14b — 16GB RAM · best quality', value: 'qwen2.5-coder:14b' },
    { name: 'deepseek-coder-v2:16b — 16GB RAM · alternative', value: 'deepseek-coder-v2:16b' },
  ];
  return select({
    message: `Pick an Ollama chat model (you have ${ramGb}GB RAM — recommended: ${hint.recommendedModel})`,
    choices,
    default: hint.recommendedModel,
  });
}
