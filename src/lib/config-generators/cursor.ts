/**
 * Generator for `.cursor/mcp.json`.
 * @package @fluxomind/cli
 */

export function generateCursorMcpJson(): Record<string, unknown> {
  return {
    mcpServers: {
      fluxomind: {
        command: 'fmx',
        args: ['mcp', 'serve'],
      },
    },
  };
}
