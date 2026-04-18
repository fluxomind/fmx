/**
 * Validates that static templates in packages/cli/templates/dev-env/ parse as JSON
 * and carry the expected canonical shape.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const TEMPLATES_DIR = join(__dirname, '../../../templates/dev-env');

function loadJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(TEMPLATES_DIR, relPath), 'utf-8')) as Record<string, unknown>;
}

describe('static templates', () => {
  it('vscode/mcp.json has servers.fluxomind with command fmx and args [mcp, serve]', () => {
    const t = loadJson('vscode/mcp.json');
    const server = (t.servers as Record<string, { command: string; args: string[] }>).fluxomind;
    expect(server.command).toBe('fmx');
    expect(server.args).toEqual(['mcp', 'serve']);
  });

  it('cursor/mcp.json uses mcpServers root', () => {
    const t = loadJson('cursor/mcp.json');
    expect(t.mcpServers).toBeDefined();
  });

  it('claude-code/project-mcp.json uses mcpServers root', () => {
    const t = loadJson('claude-code/project-mcp.json');
    expect(t.mcpServers).toBeDefined();
  });

  it('claude-code/claude-settings.json enables fluxomind and restricts Bash to fmx/git/npm', () => {
    const t = loadJson('claude-code/claude-settings.json');
    const perms = (t.permissions as Record<string, string[]>).allow;
    expect(perms).toEqual(['Bash(fmx:*)', 'Bash(git:*)', 'Bash(npm:*)']);
    expect(t.enabledMcpjsonServers).toEqual(['fluxomind']);
  });

  it('continue/ollama.json points models at http://localhost:11434', () => {
    const t = loadJson('continue/ollama.json');
    const models = t.models as Array<{ apiBase: string }>;
    expect(models[0].apiBase).toBe('http://localhost:11434');
  });

  it('continue/anthropic.json uses env var placeholder, never hardcoded key', () => {
    const t = loadJson('continue/anthropic.json');
    const models = t.models as Array<{ apiKey: string }>;
    expect(models[0].apiKey).toBe('${env:ANTHROPIC_API_KEY}');
    expect(models[0].apiKey).not.toMatch(/sk-/);
  });

  it('no template contains secret patterns', () => {
    const files = [
      'vscode/mcp.json',
      'vscode/settings.json',
      'vscode/extensions.json',
      'cursor/mcp.json',
      'claude-code/project-mcp.json',
      'claude-code/claude-settings.json',
      'continue/ollama.json',
      'continue/anthropic.json',
    ];
    for (const file of files) {
      const raw = readFileSync(join(TEMPLATES_DIR, file), 'utf-8');
      expect(raw).not.toMatch(/eyJ[A-Za-z0-9]+/);
      expect(raw).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      expect(raw).not.toMatch(/github_pat_[A-Za-z0-9]{10,}/);
      expect(raw).not.toMatch(/ghp_[A-Za-z0-9]{20,}/);
    }
  });
});
