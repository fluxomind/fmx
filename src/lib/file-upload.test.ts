import { describe, it, expect, vi } from 'vitest';
import { transferFile } from './file-upload';
const session = { success: true, sessionId: 'id', sessionToken: 'secret', uploadUrl: 'https://storage.invalid/signed-secret', method: 'PUT' as const, protocol: 'resumable' as const, headers: { 'Content-Type': 'text/plain' } };
describe('direct storage transfer', () => {
  it('resumes from the confirmed offset after a lost response', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('signed-secret')).mockResolvedValueOnce(new Response(null,{status:308,headers:{range:'bytes=0-3'}})).mockResolvedValueOnce(new Response(null,{status:200}));
    await transferFile(new Blob(['abcdefgh']),session,{fetchImpl,retryDelayMs:0});
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(c=>c[1].headers.get('content-range'))).toEqual(['bytes 0-7/8','bytes */8','bytes 4-7/8']);
    expect(await fetchImpl.mock.calls[2][1].body.text()).toBe('efgh');
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
    expect(fetchImpl.mock.calls[0][1].headers.has('authorization')).toBe(false);
  });
  it('retries a single PUT with the entire file', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(new Response(null,{status:200}));
    await transferFile(new Blob(['abcdefgh']),{...session,protocol:'single'},{fetchImpl,retryDelayMs:0});
    expect(await fetchImpl.mock.calls[1][1].body.text()).toBe('abcdefgh');
    expect(fetchImpl.mock.calls[1][1].headers.has('content-range')).toBe(false);
  });
  it('bounds retries and never exposes signed credentials in errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(session.uploadUrl));
    await expect(transferFile(new Blob(['x']),session,{fetchImpl,retryDelayMs:0})).rejects.toThrow('limited retries');
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
  it('rejects permanent failures and malformed offsets', async () => {
    await expect(transferFile(new Blob(['x']),session,{fetchImpl:vi.fn().mockResolvedValue(new Response(null,{status:403}))})).rejects.toThrow('storage HTTP 403');
    await expect(transferFile(new Blob(['x']),session,{fetchImpl:vi.fn().mockResolvedValue(new Response(null,{status:308,headers:{range:'bytes=0-100'}}))})).rejects.toThrow('invalid upload offset');
  });
});
