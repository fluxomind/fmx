/**
 * Generators for Claude Code CLI: `.mcp.json` (project scope) + `.claude/settings.json`.
 * @package @fluxomind/cli
 */

export function generateProjectMcpJson(): Record<string, unknown> {
  return {
    mcpServers: {
      fluxomind: {
        command: 'fmx',
        args: ['mcp', 'serve'],
      },
    },
  };
}

export function generateClaudeSettings(): Record<string, unknown> {
  return {
    permissions: {
      allow: ['Bash(fmx:*)', 'Bash(git:*)', 'Bash(npm:*)'],
    },
    enabledMcpjsonServers: ['fluxomind'],
  };
}
