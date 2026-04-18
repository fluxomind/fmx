/**
 * Browser OAuth flow — ephemeral HTTP server + open browser + CSRF-protected callback.
 * Reference: OAuth 2.0 Authorization Code Grant (RFC 6749 §4.1) adapted for local CLI.
 * @package @fluxomind/cli
 */

import http, { IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { URL } from 'url';
import { generateState, validateState } from './state';

export interface BrowserOAuthResult {
  code: string;
  tenant: string;
  callback: string;
}

export interface BrowserOAuthOptions {
  platformBaseUrl: string;
  tenant: string;
  timeoutMs?: number;
  openBrowser?: (url: string) => Promise<void> | void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

async function defaultOpenBrowser(url: string): Promise<void> {
  const openModule = await import('open');
  await openModule.default(url);
}

function renderHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}main{max-width:480px;padding:32px;text-align:center;background:#1e293b;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.4)}h1{margin:0 0 12px;font-size:20px}p{margin:0;color:#94a3b8}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

export async function runBrowserOAuth(options: BrowserOAuthOptions): Promise<BrowserOAuthResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const openBrowser = options.openBrowser ?? defaultOpenBrowser;
  const expectedState = generateState();

  return new Promise<BrowserOAuthResult>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1`);
        if (requestUrl.pathname !== '/callback') {
          res.statusCode = 404;
          res.end();
          return;
        }

        const receivedState = requestUrl.searchParams.get('state') ?? '';
        const code = requestUrl.searchParams.get('code') ?? '';
        const errorParam = requestUrl.searchParams.get('error');

        if (errorParam) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(renderHtml('Authorization failed', errorParam));
          finish(new Error(`Authorization error: ${errorParam}`));
          return;
        }

        if (!validateState(receivedState, expectedState)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(renderHtml('CSRF mismatch', 'State parameter did not match. Request rejected.'));
          finish(new Error('CSRF state mismatch'));
          return;
        }

        if (!code) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(renderHtml('Authorization failed', 'Missing authorization code.'));
          finish(new Error('Missing authorization code in callback'));
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          renderHtml(
            'Authorization complete',
            'You can close this tab and return to your terminal.',
          ),
        );
        finish(null, { code, tenant: options.tenant, callback: callbackUrl });
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    let callbackUrl = '';

    function finish(err: Error | null, value?: BrowserOAuthResult): void {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      server.close(() => {
        if (err) reject(err);
        else resolve(value!);
      });
    }

    server.on('error', (err) => finish(err));

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        finish(new Error('Failed to bind local HTTP server'));
        return;
      }
      callbackUrl = `http://127.0.0.1:${address.port}/callback`;

      const platform = options.platformBaseUrl.replace(/\/$/, '');
      const authorizeUrl =
        `${platform}/auth/cli?state=${encodeURIComponent(expectedState)}` +
        `&callback=${encodeURIComponent(callbackUrl)}` +
        `&tenant=${encodeURIComponent(options.tenant)}`;

      timer = setTimeout(() => {
        finish(
          new Error(
            `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for browser authorization`,
          ),
        );
      }, timeoutMs);

      Promise.resolve(openBrowser(authorizeUrl)).catch((err) => {
        finish(err instanceof Error ? err : new Error(String(err)));
      });
    });
  });
}
