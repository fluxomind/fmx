/** Run bounded independent reads; wait for outstanding work before reporting failure. */
export async function mapLimited<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0; let failed = false; let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await run(items[index], index); }
      catch (error) { failed = true; failure = error; }
    }
  }));
  if (failed) throw failure;
  return results;
}
