import { runBrowserOAuth } from './browser-flow';

async function simulateCallback(authorizeUrl: string, overrides?: { state?: string; code?: string }): Promise<Response> {
  const url = new URL(authorizeUrl);
  const state = overrides?.state ?? url.searchParams.get('state')!;
  const code = overrides?.code ?? 'mock-auth-code';
  const callback = url.searchParams.get('callback')!;
  const target = new URL(callback);
  target.searchParams.set('state', state);
  target.searchParams.set('code', code);
  return fetch(target.toString());
}

describe('runBrowserOAuth', () => {
  it('resolves with code when callback state matches', async () => {
    const pending = runBrowserOAuth({
      platformBaseUrl: 'https://platform.example',
      tenant: 'acme',
      timeoutMs: 5_000,
      openBrowser: async (url) => {
        await simulateCallback(url);
      },
    });

    await expect(pending).resolves.toMatchObject({
      code: 'mock-auth-code',
      tenant: 'acme',
    });
  });

  it('rejects when state does not match (CSRF protection)', async () => {
    const pending = runBrowserOAuth({
      platformBaseUrl: 'https://platform.example',
      tenant: 'acme',
      timeoutMs: 5_000,
      openBrowser: async (url) => {
        await simulateCallback(url, { state: 'tampered' });
      },
    });

    await expect(pending).rejects.toThrow(/CSRF state mismatch/);
  });

  it('rejects when code is missing from callback', async () => {
    const pending = runBrowserOAuth({
      platformBaseUrl: 'https://platform.example',
      tenant: 'acme',
      timeoutMs: 5_000,
      openBrowser: async (url) => {
        await simulateCallback(url, { code: '' });
      },
    });

    await expect(pending).rejects.toThrow(/Missing authorization code/);
  });

  it('rejects on timeout', async () => {
    const pending = runBrowserOAuth({
      platformBaseUrl: 'https://platform.example',
      tenant: 'acme',
      timeoutMs: 50,
      openBrowser: async () => {
        // Never trigger callback — simulate browser being stuck
      },
    });

    await expect(pending).rejects.toThrow(/Timed out/);
  });
});
