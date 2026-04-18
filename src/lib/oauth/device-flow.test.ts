import { runDeviceOAuth } from './device-flow';

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

function jsonResponse(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('runDeviceOAuth', () => {
  const platformBaseUrl = 'https://platform.example';
  const tenant = 'acme';

  it('returns tokens after authorization completes', async () => {
    const responses: MockResponse[] = [
      jsonResponse({
        device_code: 'dev-xyz',
        user_code: 'ABCD-1234',
        verification_uri: `${platformBaseUrl}/activate`,
        verification_uri_complete: `${platformBaseUrl}/activate?code=ABCD-1234`,
        expires_in: 600,
        interval: 1,
      }),
      jsonResponse({ error: 'authorization_pending' }, 400),
      jsonResponse({
        accessToken: 'session-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        email: 'dev@example.com',
        tenantId: 'tenant-1',
      }),
    ];
    const fetchFn = jest.fn(async () => responses.shift()!) as unknown as typeof fetch;

    const notifications: Array<{ userCode: string }> = [];
    const tokens = await runDeviceOAuth({
      platformBaseUrl,
      tenant,
      fetchFn,
      sleepMs: async () => {},
      onUserAction: (info) => notifications.push(info),
    });

    expect(tokens.accessToken).toBe('session-token');
    expect(tokens.email).toBe('dev@example.com');
    expect(notifications).toEqual([
      expect.objectContaining({ userCode: 'ABCD-1234' }),
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('backs off on slow_down and continues polling', async () => {
    const responses: MockResponse[] = [
      jsonResponse({
        device_code: 'dev-xyz',
        user_code: 'ABCD-1234',
        verification_uri: `${platformBaseUrl}/activate`,
        verification_uri_complete: `${platformBaseUrl}/activate?code=ABCD-1234`,
        expires_in: 600,
        interval: 1,
      }),
      jsonResponse({ error: 'slow_down' }, 400),
      jsonResponse({
        accessToken: 'session-token',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    ];
    const sleepCalls: number[] = [];
    const fetchFn = jest.fn(async () => responses.shift()!) as unknown as typeof fetch;

    await runDeviceOAuth({
      platformBaseUrl,
      tenant,
      fetchFn,
      sleepMs: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    expect(sleepCalls.length).toBe(2);
    expect(sleepCalls[1]).toBeGreaterThan(sleepCalls[0]);
  });

  it('throws on expired_token', async () => {
    const responses: MockResponse[] = [
      jsonResponse({
        device_code: 'dev-xyz',
        user_code: 'ABCD-1234',
        verification_uri: `${platformBaseUrl}/activate`,
        verification_uri_complete: `${platformBaseUrl}/activate?code=ABCD-1234`,
        expires_in: 600,
        interval: 1,
      }),
      jsonResponse({ error: 'expired_token' }, 400),
    ];
    const fetchFn = jest.fn(async () => responses.shift()!) as unknown as typeof fetch;

    await expect(
      runDeviceOAuth({
        platformBaseUrl,
        tenant,
        fetchFn,
        sleepMs: async () => {},
      }),
    ).rejects.toThrow(/Device code expired/);
  });

  it('throws on access_denied', async () => {
    const responses: MockResponse[] = [
      jsonResponse({
        device_code: 'dev-xyz',
        user_code: 'ABCD-1234',
        verification_uri: `${platformBaseUrl}/activate`,
        verification_uri_complete: `${platformBaseUrl}/activate?code=ABCD-1234`,
        expires_in: 600,
        interval: 1,
      }),
      jsonResponse({ error: 'access_denied' }, 400),
    ];
    const fetchFn = jest.fn(async () => responses.shift()!) as unknown as typeof fetch;

    await expect(
      runDeviceOAuth({
        platformBaseUrl,
        tenant,
        fetchFn,
        sleepMs: async () => {},
      }),
    ).rejects.toThrow(/Authorization denied/);
  });
});
