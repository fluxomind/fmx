/**
 * Snapshot tests for config generators + secret-leak guardrail.
 */

import { generateVscodeMcpJson, generateVscodeSettings, generateVscodeExtensionsRecommendations } from './vscode';
import { generateCursorMcpJson } from './cursor';
import { generateProjectMcpJson, generateClaudeSettings } from './claude-code';
import { generateContinueOllamaConfig, generateContinueAnthropicConfig } from './continue';

const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_\-.]+/,
  /sk-[A-Za-z0-9_\-]{10,}/,
  /github_pat_[A-Za-z0-9_]{10,}/,
  /ghp_[A-Za-z0-9_]{10,}/,
  /ANTHROPIC-[A-Z0-9]{10,}/,
];

function assertNoSecrets(obj: unknown): void {
  const raw = JSON.stringify(obj);
  for (const pattern of SECRET_PATTERNS) {
    expect(raw).not.toMatch(pattern);
  }
}

describe('vscode generators', () => {
  it('generateVscodeMcpJson matches snapshot', () => {
    const out = generateVscodeMcpJson();
    expect(out).toMatchSnapshot();
    assertNoSecrets(out);
  });

  it('generateVscodeSettings matches snapshot', () => {
    const out = generateVscodeSettings();
    expect(out).toMatchSnapshot();
    assertNoSecrets(out);
  });

  it('generateVscodeExtensionsRecommendations restricts to selected clients', () => {
    const out = generateVscodeExtensionsRecommendations(['copilot', 'cursor']);
    expect((out.recommendations as string[]).sort()).toMatchSnapshot();
    expect(out.recommendations).toContain('github.copilot');
    expect(out.recommendations).not.toContain('continue.continue');
    assertNoSecrets(out);
  });

  it('includes continue.continue for continue-* clients', () => {
    const out = generateVscodeExtensionsRecommendations(['continue-ollama']);
    expect(out.recommendations).toContain('continue.continue');
  });
});

describe('cursor generator', () => {
  it('matches snapshot with mcpServers root key', () => {
    const out = generateCursorMcpJson();
    expect(out).toMatchSnapshot();
    expect((out as Record<string, unknown>).mcpServers).toBeDefined();
    assertNoSecrets(out);
  });
});

describe('claude-code generators', () => {
  it('generateProjectMcpJson matches snapshot', () => {
    const out = generateProjectMcpJson();
    expect(out).toMatchSnapshot();
    assertNoSecrets(out);
  });

  it('generateClaudeSettings has minimal permissions and enables MCP server', () => {
    const out = generateClaudeSettings();
    expect(out).toMatchSnapshot();
    const perms = (out.permissions as Record<string, string[]>).allow;
    expect(perms).toEqual(['Bash(fmx:*)', 'Bash(git:*)', 'Bash(npm:*)']);
    expect(out.enabledMcpjsonServers).toEqual(['fluxomind']);
    assertNoSecrets(out);
  });
});

describe('continue generators', () => {
  it('Ollama config defaults to qwen2.5-coder and localhost', () => {
    const out = generateContinueOllamaConfig();
    expect(out).toMatchSnapshot();
    const models = out.models as Array<{ model: string; apiBase: string }>;
    expect(models[0].model).toBe('qwen2.5-coder:7b');
    expect(models[0].apiBase).toBe('http://localhost:11434');
    assertNoSecrets(out);
  });

  it('Ollama config honors overrides', () => {
    const out = generateContinueOllamaConfig({ model: 'qwen2.5-coder:14b', apiBase: 'http://ollama:11434' });
    const models = out.models as Array<{ model: string; apiBase: string }>;
    expect(models[0].model).toBe('qwen2.5-coder:14b');
    expect(models[0].apiBase).toBe('http://ollama:11434');
  });

  it('Anthropic config uses env var placeholder and no hardcoded key', () => {
    const out = generateContinueAnthropicConfig();
    expect(out).toMatchSnapshot();
    const models = out.models as Array<{ apiKey: string }>;
    expect(models[0].apiKey).toBe('${env:ANTHROPIC_API_KEY}');
    assertNoSecrets(out);
  });
});
