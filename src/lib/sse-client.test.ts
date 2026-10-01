import { vi, type Mock } from 'vitest';
import { SSEClient } from './sse-client';

vi.mock('./auth-manager', () => ({ getAuthToken: () => 'token' }));
vi.mock('./config-manager', () => ({ resolveApiUrl: () => 'https://api.example.test' }));

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
