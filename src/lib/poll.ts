/** Shared bounded observation. Callers decide terminal states; no mutations or automatic retries. */
export async function poll<T>(options: { read: (remainingMs: number) => Promise<T>; stopped: (value: T) => boolean; timeout: number; interval: number; maxInterval?: number }): Promise<{ outcome: 'stopped'; value: T } | { outcome: 'timeout' }> {
  let interval = options.interval;
  const ceiling = options.maxInterval ?? Math.max(options.interval, Math.min(options.interval * 8, 10_000));
  const deadline = Date.now() + options.timeout;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { outcome: 'timeout' };
    let value: T;
    try { value = await options.read(remaining); }
    catch (err) { if (Date.now() >= deadline) return { outcome: 'timeout' }; throw err; }
    if (options.stopped(value)) return { outcome: 'stopped', value };
    await new Promise(r => setTimeout(r, Math.min(interval, Math.max(0, deadline - Date.now()))));
    interval = Math.min(ceiling, interval * 1.5);
  }
}
