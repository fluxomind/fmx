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
  /** Reopen a server-bounded stream after a clean EOF (for long-lived tail/dev commands). */
  reconnectOnEof?: boolean;
}

export class SSEClient {
  private controller: AbortController | null = null;
  private retryCount = 0;
  private lastEventId: string | undefined;
  private stopped = false;

  constructor(private readonly options: SSEOptions) {
    this.lastEventId = options.lastEventId;
  }

  async connect(): Promise<void> {
    this.stopped = false;
    this.retryCount = 0;
    const maxRetries = this.options.maxRetries ?? 5;

    while (!this.stopped) {
      let cleanEof = false;
      try {
        await this.openOnce();
        cleanEof = true;
        this.retryCount = 0;
      } catch (err) {
        if ((err as Error).name === 'AbortError' || this.stopped) return;
        this.options.onError?.(err as Error);
        if (this.retryCount >= maxRetries) return;
        this.retryCount++;
      }

      if (this.stopped || (cleanEof && !this.options.reconnectOnEof)) return;
      await this.waitBeforeRetry(cleanEof ? 1 : this.retryCount);
    }
  }

  private async openOnce(): Promise<void> {
    const token = getAuthToken();
    const url = `${resolveApiUrl()}${this.options.path}`;
    this.controller = new AbortController();

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (this.lastEventId) headers['Last-Event-ID'] = this.lastEventId;

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
    let eventType = 'message';
    let data = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data += `${data ? '\n' : ''}${line.slice(5).trimStart()}`;
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
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  disconnect(): void {
    this.stopped = true;
    this.controller?.abort();
    this.controller = null;
  }
}
