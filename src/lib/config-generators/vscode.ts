/**
 * Generators for `.vscode/*` configs — MCP server, settings merge, extensions recommendations.
 * @package @fluxomind/cli
 */

import type { AiClient } from '../types/dev-env';
import { CURRENT_PRESET_VERSION } from '../types/dev-env';

export function generateVscodeMcpJson(): Record<string, unknown> {
  return {
    servers: {
      fluxomind: {
        command: 'fmx',
        args: ['mcp', 'serve'],
      },
    },
  };
}

export function generateVscodeSettings(): Record<string, unknown> {
  return {
    'github.copilot.chat.mcp.enabled': true,
    'typescript.tsdk': 'node_modules/typescript/lib',
    'files.associations': {
      'fluxomind.extension.toml': 'toml',
    },
    'fluxomind.devEnv.presetVersion': CURRENT_PRESET_VERSION,
  };
}

const EXTENSION_MAP: Record<AiClient, string[]> = {
  copilot: ['github.copilot', 'github.copilot-chat'],
  'continue-ollama': ['continue.continue'],
  'continue-anthropic': ['continue.continue'],
  'claude-code': ['anthropic.claude-code'],
  cursor: [],
};

const ALWAYS_RECOMMENDED = ['tamasfe.even-better-toml'];

export function generateVscodeExtensionsRecommendations(
  selectedClients: AiClient[],
): Record<string, unknown> {
  const set = new Set<string>(ALWAYS_RECOMMENDED);
  for (const client of selectedClients) {
    for (const ext of EXTENSION_MAP[client] ?? []) set.add(ext);
  }
  return {
    recommendations: Array.from(set),
  };
}
