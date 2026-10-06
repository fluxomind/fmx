import { describe, it, expect } from 'vitest';
import { mapLimited } from './concurrency';
describe('bounded parallel reads', () => {
  it('preserves order and bounds concurrent requests', async () => {
    let active = 0, peak = 0;
    const result = await mapLimited([1, 2, 3, 4, 5], 2, async value => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--; return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]); expect(peak).toBe(2);
  });
  it('drains in-flight reads and stops dispatch after a failure', async () => {
    const visited: number[] = []; let completed = false;
    await expect(mapLimited([1, 2, 3, 4], 2, async value => {
      visited.push(value);
      if (value === 1) throw new Error('denied');
      await new Promise(resolve => setTimeout(resolve, 5)); completed = true;
    })).rejects.toThrow('denied');
    expect(completed).toBe(true); expect(visited).toEqual([1, 2]);
  });
});
