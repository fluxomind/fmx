/**
 * Generator for `.cursor/mcp.json`.
 * @package @fluxomind/cli
 */

export function generateCursorMcpJson(): Record<string, unknown> {
  return {
    mcpServers: {
      fluxomind: {
        type: 'http',
        url: 'https://platform.fluxomind.com/api/mcp',
      },
    },
  };
}
