import { Command } from 'commander';
import { saveTokens, getAuthStatus, clearAuth, getStoredTenants } from '../lib/auth-manager';
import { loadConfig } from '../lib/config-manager';
import { runBrowserOAuth } from '../lib/oauth/browser-flow';
import { runDeviceOAuth } from '../lib/oauth/device-flow';
import { success, error, info, dim } from '../lib/output';

interface ExchangeResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
  tenantId: string;
}

async function persistTokens(tenant: string, tokens: ExchangeResponse): Promise<void> {
  const expiresAt = Date.parse(tokens.expiresAt);
  saveTokens(tenant, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Number.isNaN(expiresAt) ? undefined : expiresAt,
    email: tokens.email,
  });
}

async function exchangeBrowserCode(
  apiBaseUrl: string,
  code: string,
  tenant: string,
): Promise<ExchangeResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/cli/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, tenantId: tenant === 'default' ? undefined : tenant }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Authorization exchange failed: HTTP ${response.status} ${text}`);
  }
  return (await response.json()) as ExchangeResponse;
}

export const authCommand = new Command('auth').description('Authenticate with Fluxomind Platform');

authCommand
  .command('login')
  .description('Login via browser OAuth flow (default) or device code flow')
  .option('--tenant <name>', 'Tenant to authenticate with')
  .option('--device', 'Use device code flow (for environments without a browser)')
  .action(async (opts: { tenant?: string; device?: boolean }) => {
    const tenant = opts.tenant ?? 'default';
    const config = loadConfig();

    try {
      if (opts.device) {
        info('Initiating device authorization...');
        const tokens = await runDeviceOAuth({
          platformBaseUrl: config.apiBaseUrl,
          tenant,
          onUserAction: ({ userCode, verificationUri, verificationUriComplete }) => {
            info(`Open in a browser: ${verificationUri}`);
            info(`Enter code: ${userCode}`);
            info(`(or scan: ${verificationUriComplete})`);
          },
        });
        await persistTokens(tenant, tokens as ExchangeResponse);
        success(`Authenticated as ${tokens.email ?? 'unknown'} (tenant: ${tenant})`);
        return;
      }

      info('Opening browser for authentication...');
      const { code } = await runBrowserOAuth({
        platformBaseUrl: config.apiBaseUrl,
        tenant,
      });
      const tokens = await exchangeBrowserCode(config.apiBaseUrl, code, tenant);
      await persistTokens(tenant, tokens);
      success(`Authenticated as ${tokens.email} (tenant: ${tenant})`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

authCommand
  .command('logout')
  .description('Logout and remove stored credentials')
  .option('--tenant <name>', 'Specific tenant to logout from')
  .option('--all', 'Logout from all tenants')
  .action((opts: { tenant?: string; all?: boolean }) => {
    if (opts.all) {
      clearAuth();
      success('Logged out from all tenants');
    } else {
      clearAuth(opts.tenant);
      success(`Logged out${opts.tenant ? ` from "${opts.tenant}"` : ''}`);
    }
  });

authCommand
  .command('status')
  .description('Show current authentication status')
  .action(() => {
    const tenants = getStoredTenants();
    if (tenants.length === 0) {
      info('Not authenticated. Run: fmx auth login');
      return;
    }

    for (const tenant of tenants) {
      const status = getAuthStatus(tenant);
      if (status.authenticated) {
        success(`${tenant}: authenticated${status.email ? ` (${status.email})` : ''}`);
        if (status.expiresAt) {
          const remaining = Math.max(0, status.expiresAt - Date.now());
          info(`  Expires in: ${dim(Math.round(remaining / 60_000) + ' minutes')}`);
        }
      } else {
        info(`${tenant}: expired or invalid`);
      }
    }
  });
