import { vi, describe, it, expect } from 'vitest';
import { metadataCommand } from './inspect';
import { get } from '../lib/api-client';
import { print } from '../lib/output';
vi.mock('../lib/api-client', () => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/output', () => ({ print: vi.fn() }));
describe('metadata server pagination', () => {
  it('requests a lookahead and never mistakes the backend page size for total', async () => {
    vi.mocked(get).mockResolvedValue({ objects: [{ apiName: 'a' }, { apiName: 'b' }, { apiName: 'c' }] });
    await metadataCommand.parseAsync(['node', 'fmx', 'list', '--limit', '2', '--offset', '5', '--tenant', 'tenant']);
    expect(get).toHaveBeenCalledWith('/api/code-engine/metadata?limit=3&offset=5', 'tenant');
    expect(print).toHaveBeenCalledWith(expect.objectContaining({ count: 2, total: null, hasMore: true, offset: 5, help: 'fmx metadata list --offset 7 --limit 2 --tenant tenant' }));
  });
});
