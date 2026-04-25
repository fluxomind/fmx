/**
 * SSE Client — Server-Sent Events with auto-reconnect
 * @package @fluxomind/cli
 */

import { getAuthToken } from './auth-manager';
import { resolveApiUrl } from './config-manager';

export interface SSEOptions {
  path: string;
  onMessage: (event: string, data: string) => void;
  onError?: (err: Error) => void;
  lastEventId?: string;
  maxRetries?: number;
}

export class SSEClient {
  private controller: AbortController | null = null;
  private retryCount = 0;
  private lastEventId: string | undefined;

  constructor(private readonly options: SSEOptions) {
    this.lastEventId = options.lastEventId;
  }

  async connect(): Promise<void> {
    const token = getAuthToken();
    const url = `${resolveApiUrl()}${this.options.path}`;
    const maxRetries = this.options.maxRetries ?? 5;

    this.controller = new AbortController();

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (this.lastEventId) headers['Last-Event-ID'] = this.lastEventId;

    try {
      const response = await fetch(url, {
        headers,
        signal: this.controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = 'message';
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            data += line.slice(5).trim();
          } else if (line.startsWith('id:')) {
            this.lastEventId = line.slice(3).trim();
          } else if (line === '') {
            if (data) {
              this.options.onMessage(eventType, data);
              data = '';
              eventType = 'message';
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;

      this.options.onError?.(err as Error);

      if (this.retryCount < maxRetries) {
        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.connect();
      }
    }
  }

  disconnect(): void {
    this.controller?.abort();
    this.controller = null;
  }
}
