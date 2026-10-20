import { openAsBlob, statSync } from 'node:fs';
import { basename } from 'node:path';
import { InvalidArgumentError } from 'commander';
import { apiRequest } from './api-client';
import { isDryRun } from './dry-run';
import { isReadOnly, ReadOnlyError } from './request-policy';

const endpoint = '/api/services/fileEngine/upload-sessions';
interface Session {
  success: boolean; sessionId: string; sessionToken: string; uploadUrl: string;
  method: 'PUT'; protocol: 'single' | 'resumable'; headers: Record<string, string>;
}
interface TransferOptions {
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

// Storage URLs and session tokens are credentials: never include them in errors.
export async function transferFile(file: Blob, session: Session, options: TransferOptions = {}): Promise<void> {
  let target: URL;
  try { target = new URL(session.uploadUrl); } catch { throw new Error('Invalid upload session target'); }
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password || session.method !== 'PUT' || !['single', 'resumable'].includes(session.protocol)) throw new Error('Invalid upload session target');
  const headers = new Headers(session.headers);
  if (headers.has('authorization') || headers.has('cookie')) throw new Error('Invalid storage authentication headers');
  const fetchImpl = options.fetchImpl ?? fetch;
  const resumable = session.protocol === 'resumable';
  const total = file.size;
  let offset = 0;
  let probe = false;
  let failures = 0;
  const request = async () => {
    const currentHeaders = new Headers(headers);
    if (resumable) currentHeaders.set('Content-Range', probe ? `bytes */${total}` : `bytes ${offset}-${total - 1}/${total}`);
    try {
      return await fetchImpl(target, { method: 'PUT', headers: currentHeaders,
        body: probe ? null : file.slice(offset), redirect: 'manual', signal: AbortSignal.timeout(120_000) });
    } catch { return null; }
  };
  while (true) {
    const response = await request();
    if (response && (resumable ? [200, 201].includes(response.status) : response.ok)) {
      await response.body?.cancel();
      return;
    }
    let advanced = false;
    if (response) {
      await response.body?.cancel();
      if (resumable && response.status === 308) {
        const range = response.headers.get('range');
        const match = range === null ? null : /^bytes=0-(\d+)$/.exec(range);
        if (range !== null && !match) throw new Error('Storage returned an invalid upload offset');
        const next = match ? Number(match[1]) + 1 : 0;
        if (!Number.isSafeInteger(next) || next < offset || next >= total) throw new Error('Storage returned an invalid upload offset');
        advanced = next > offset;
        offset = next;
        probe = false;
      } else if (![408, 429].includes(response.status) && response.status < 500) {
        throw new Error(`Upload transfer failed (storage HTTP ${response.status})`);
      } else probe = resumable;
    } else probe = resumable;
    if (advanced) failures = 0;
    else {
      if (failures >= 5) throw new Error('Upload transfer failed after limited retries; file was not finalized');
      await new Promise(resolve => setTimeout(resolve, options.retryDelayMs ?? Math.min(1000 * 2 ** failures, 15_000)));
      failures++;
    }
  }
}

export async function uploadLocalFile(path: string, opts: { mime: string; folder?: string; tenant?: string }): Promise<unknown> {
  if (isReadOnly() && !isDryRun()) throw new ReadOnlyError();
  const stat = statSync(path);
  if (!stat.isFile() || stat.size === 0) throw new InvalidArgumentError('Upload requires a nonempty file');
  const body = { name: basename(path), size: stat.size, mimeType: opts.mime, ...(opts.folder ? { folderId: opts.folder } : {}) };
  if (isDryRun()) return { dryRun: true, writesPerformed: false, filename: body.name, bytes: body.size,
    steps: [{ method: 'POST', path: endpoint, body }, { method: 'PUT', destination: 'storage URL returned by server', protocol: 'server-selected' },
      { method: 'POST', path: `${endpoint}/:sessionId/finalize`, body: { sessionToken: '[redacted]' } }],
    warning: 'Local preview only; authentication, permissions and tenant size limit were not verified.' };
  const file = await openAsBlob(path, { type: opts.mime });
  const session = await apiRequest<Session>({ method: 'POST', path: endpoint, body, tenant: opts.tenant });
  if (!session.success || !session.sessionId || !session.sessionToken || !session.uploadUrl) throw new Error('Platform returned an invalid upload session');
  await transferFile(file, session);
  const result = await apiRequest<{ success: boolean; file?: { id: string } }>({ method: 'POST',
    path: `${endpoint}/${encodeURIComponent(session.sessionId)}/finalize`, body: { sessionToken: session.sessionToken }, tenant: opts.tenant, timeout: 120_000 });
  if (!result.success || !result.file?.id) throw new Error('Upload finalization did not return a file');
  return result;
}
