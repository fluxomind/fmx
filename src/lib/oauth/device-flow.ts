/**
 * Device Authorization Grant flow (RFC 8628).
 * @package @fluxomind/cli
 */

export interface DeviceOAuthOptions {
  platformBaseUrl: string;
  tenant: string;
  onUserAction?: (info: { userCode: string; verificationUri: string; verificationUriComplete: string }) => void;
  fetchFn?: typeof fetch;
  sleepMs?: (ms: number) => Promise<void>;
}

export interface DeviceOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  email?: string;
  tenantId?: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DevicePollErrorResponse {
  error: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' | string;
  error_description?: string;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDeviceOAuth(options: DeviceOAuthOptions): Promise<DeviceOAuthTokens> {
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleepMs ?? defaultSleep;
  const platform = options.platformBaseUrl.replace(/\/$/, '');

  const initResponse = await fetchFn(`${platform}/api/v1/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: options.tenant, client_id: 'fmx-cli' }),
  });
  if (!initResponse.ok) {
    const payload = await initResponse.text().catch(() => '');
    throw new Error(`Device code initiation failed: HTTP ${initResponse.status} ${payload}`);
  }
  const issued = (await initResponse.json()) as DeviceCodeResponse;

  options.onUserAction?.({
    userCode: issued.user_code,
    verificationUri: issued.verification_uri,
    verificationUriComplete: issued.verification_uri_complete,
  });

  const deadline = Date.now() + issued.expires_in * 1000;
  let intervalMs = Math.max(1, issued.interval) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);

    const pollResponse = await fetchFn(`${platform}/api/v1/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: issued.device_code }),
    });

    if (pollResponse.ok) {
      const tokens = (await pollResponse.json()) as DeviceOAuthTokens;
      return tokens;
    }

    let payload: DevicePollErrorResponse;
    try {
      payload = (await pollResponse.json()) as DevicePollErrorResponse;
    } catch {
      throw new Error(`Device polling failed: HTTP ${pollResponse.status}`);
    }

    switch (payload.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        intervalMs += 5000;
        continue;
      case 'expired_token':
        throw new Error('Device code expired. Please retry: fmx auth login --device');
      case 'access_denied':
        throw new Error('Authorization denied by user.');
      default:
        throw new Error(`Device polling failed: ${payload.error}${payload.error_description ? ` — ${payload.error_description}` : ''}`);
    }
  }

  throw new Error('Device authorization timed out. Please retry: fmx auth login --device');
}
