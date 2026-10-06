import { vi, type Mock } from 'vitest';
import { SSEClient } from './sse-client';
import { forceRefresh } from './auth-refresh';
import { getTenantAuth } from './auth-manager';

vi.mock('./auth-manager', () => ({ getAuthToken: () => 'token', getTenantAuth: vi.fn(() => ({ accessToken: 'token' })), getStoredTenants: () => ['tenant'] }));
vi.mock('./project-context', () => ({ projectContext: () => null }));
vi.mock('./auth-refresh', () => ({ refreshIfExpired: async () => ({ refreshed: false }), forceRefresh: vi.fn(async () => ({ refreshed: false })) }));
vi.mock('./config-manager', () => ({ resolveApiUrl: () => 'https://api.example.test', loadConfig: () => ({ defaultTenant: 'tenant' }) }));

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const value of chunks) controller.enqueue(encoder.encode(value));
      controller.close();
    },
  }), { status: 200 });
}

describe('SSEClient — BUG-350 bounded stream contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('preserves event state when a frame is split across network chunks', async () => {
    const onMessage = vi.fn();
    (global.fetch as Mock).mockResolvedValueOnce(responseFromChunks([
      'id: log-1\nevent: lo',
      'g\ndata: {"message":"real"}\n',
      '\n',
    ]));
    const client = new SSEClient({ path: '/stream', onMessage, maxRetries: 0 });

    await client.connect();

    expect(onMessage).toHaveBeenCalledWith('log', '{"message":"real"}');
  });

  it('reconnects after bounded EOF using Last-Event-ID', async () => {
    const onMessage = vi.fn();
    (global.fetch as Mock)
      .mockResolvedValueOnce(responseFromChunks(['id: log-1\nevent: log\ndata: {}\n\n']))
      .mockImplementationOnce((_url: string, init: { signal: AbortSignal }) => new Response(new ReadableStream({
        start(controller) {
          init.signal.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        },
      }), { status: 200 }));
    const client = new SSEClient({ path: '/stream', onMessage, maxRetries: 1, reconnectOnEof: true });

    const connecting = client.connect();
    await Promise.resolve();
    await Promise.resolve();
    await vi.runOnlyPendingTimersAsync();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ 'Last-Event-ID': 'log-1' }),
    }));
    client.disconnect();
    await connecting;
  });
});

describe('SSE authorization boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.mocked(forceRefresh).mockResolvedValue({ refreshed: false }); vi.mocked(getTenantAuth).mockReturnValue({ accessToken: 'token' } as any); });
  it('refreshes once after 401 and sends the renewed credential on the retry', async () => {
    vi.mocked(forceRefresh).mockImplementationOnce(async () => { vi.mocked(getTenantAuth).mockReturnValue({ accessToken: 'renewed' } as any); return { refreshed: true, accessToken: 'renewed' }; });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(responseFromChunks(['data: okay\n\n']));
    vi.stubGlobal('fetch', fetchMock);
    await new SSEClient({ path: '/api/services/events', tenant: 'tenant', onMessage: vi.fn() }).connect();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer renewed', Cookie: 'session=renewed' });
  });
  it('uses the session cookie on internal routes and stops on denial', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SSEClient({ path: '/api/services/notifications/stream', tenant: 'tenant', onMessage: vi.fn() });
    await expect(client.connect()).rejects.toMatchObject({ statusCode: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer token', Cookie: 'session=token' });
  });
});
