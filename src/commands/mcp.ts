import { Command } from 'commander';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { error, info, warn } from '../lib/output';
import { loadConfig } from '../lib/config-manager';
import { getAuthToken, getStoredTenants, getTenantAuth } from '../lib/auth-manager';

const DEPRECATION_NOTICE =
  "[DEPRECATION] 'fmx mcp --local' is deprecated. Use 'fmx mcp serve'. Alias will be removed in v2.0.0.";

interface McpRunOptions {
  tenant?: string;
}

/**
 * Locate the compiled MCP bin script. Resolution strategy:
 *   1. FLUXOMIND_MCP_BIN env var (explicit override — useful for dev / monorepo).
 *   2. Relative to this file: ../../dist/mcp/bin.js (when CLI is bundled with platform build).
 *   3. Repo-local fallback: <repoRoot>/dist/mcp/bin.js (when running from source).
 *
 * Returns the absolute path if found, else null.
 */
function locateMcpBin(): string | null {
  if (process.env.FLUXOMIND_MCP_BIN) {
    const override = resolve(process.env.FLUXOMIND_MCP_BIN);
    return existsSync(override) ? override : null;
  }

  // CLI compiles to CommonJS — __dirname is available at runtime.
  const thisDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

  const candidates = [
    join(thisDir, '../../dist/mcp/bin.js'),
    join(thisDir, '../../../dist/mcp/bin.js'),
    join(thisDir, '../../../../dist/mcp/bin.js'),
    resolve(process.cwd(), 'dist/mcp/bin.js'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return resolve(candidate);
  }
  return null;
}

async function runMcpServer(opts: McpRunOptions): Promise<void> {
  const config = loadConfig();
  const tenants = getStoredTenants();

  if (tenants.length === 0) {
    error("No authenticated tenant found. Run 'fmx auth login' first.");
    process.exit(1);
  }

  const tenant = opts.tenant ?? config.defaultTenant ?? tenants[0];
  const tenantAuth = getTenantAuth(tenant);
  const token = tenantAuth?.accessToken ?? getAuthToken(tenant);

  if (!token) {
    error(`No valid token for tenant "${tenant}". Run 'fmx auth login' to re-authenticate.`);
    process.exit(1);
  }

  const mcpBin = locateMcpBin();
  if (!mcpBin) {
    error('Could not locate MCP server binary (dist/mcp/bin.js).');
    info('Set FLUXOMIND_MCP_BIN to the path of the compiled bin, or run `npm run build` at the repo root.');
    process.exit(1);
  }

  const env = {
    ...process.env,
    FLUXOMIND_MCP_AUTH_TOKEN: token,
    FLUXOMIND_MCP_TENANT: tenant,
    FLUXOMIND_MCP_API_BASE: config.apiBaseUrl,
  };

  info(`Starting MCP server (tenant=${tenant}, api=${config.apiBaseUrl})...`);

  const child = spawn(process.execPath, [mcpBin], {
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
  child.on('error', (err) => {
    error(`Failed to start MCP server: ${err.message}`);
    process.exit(1);
  });

  const forward = (signal: NodeJS.Signals) => () => {
    if (!child.killed) child.kill(signal);
  };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));
}

const serveSubcommand = new Command('serve')
  .description('Run the Fluxomind MCP server via stdio (for Claude Code, Cursor, Copilot, Continue.dev)')
  .option('-t, --tenant <id>', 'Override active tenant (default: ~/.fmx/config.json)')
  .action(async (opts: McpRunOptions) => {
    await runMcpServer(opts);
  });

export const mcpCommand = new Command('mcp')
  .description('Manage the Fluxomind MCP server — exposes platform tools to AI clients')
  .option('--local', '[DEPRECATED] Alias for `fmx mcp serve`. Removed in v2.0.0.')
  .option('-t, --tenant <id>', 'Override active tenant (default: ~/.fmx/config.json)')
  .action(async (opts: McpRunOptions & { local?: boolean }) => {
    if (opts.local) {
      warn(DEPRECATION_NOTICE);
      await runMcpServer({ tenant: opts.tenant });
      return;
    }
    error("Use 'fmx mcp serve' to start the MCP server.");
    process.exit(1);
  })
  .addCommand(serveSubcommand);
