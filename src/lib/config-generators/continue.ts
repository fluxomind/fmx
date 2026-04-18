/**
 * Generators for `.continue/config.json` — Ollama local and Anthropic cloud variants.
 *
 * API keys are emitted as `${env:ANTHROPIC_API_KEY}` placeholders and are NEVER
 * hardcoded — the wizard refuses to write tokens to disk.
 *
 * @package @fluxomind/cli
 */

export interface ContinueOllamaOptions {
  model?: string;
  autocompleteModel?: string;
  apiBase?: string;
}

const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:7b';
const DEFAULT_OLLAMA_AUTOCOMPLETE = 'qwen2.5-coder:1.5b';
const DEFAULT_OLLAMA_API_BASE = 'http://localhost:11434';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export function generateContinueOllamaConfig(
  options: ContinueOllamaOptions = {},
): Record<string, unknown> {
  const model = options.model ?? DEFAULT_OLLAMA_MODEL;
  const autocomplete = options.autocompleteModel ?? DEFAULT_OLLAMA_AUTOCOMPLETE;
  const apiBase = options.apiBase ?? DEFAULT_OLLAMA_API_BASE;
  return {
    models: [
      {
        title: `Ollama ${model}`,
        provider: 'ollama',
        model,
        apiBase,
      },
    ],
    tabAutocompleteModel: {
      title: `Ollama ${autocomplete} (autocomplete)`,
      provider: 'ollama',
      model: autocomplete,
      apiBase,
    },
    mcpServers: [
      {
        name: 'fluxomind',
        command: 'fmx',
        args: ['mcp', 'serve'],
      },
    ],
    contextProviders: [{ name: 'file' }, { name: 'code' }, { name: 'terminal' }],
  };
}

export function generateContinueAnthropicConfig(
  model: string = DEFAULT_ANTHROPIC_MODEL,
): Record<string, unknown> {
  return {
    models: [
      {
        title: `Anthropic ${model}`,
        provider: 'anthropic',
        model,
        apiKey: '${env:ANTHROPIC_API_KEY}',
      },
    ],
    mcpServers: [
      {
        name: 'fluxomind',
        command: 'fmx',
        args: ['mcp', 'serve'],
      },
    ],
  };
}
