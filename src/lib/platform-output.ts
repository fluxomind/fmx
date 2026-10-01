import { print } from './output';
import type { JsonRecord } from './command-options';
export function compact(value: unknown, full = false): { data: unknown; truncated: boolean } {
  let truncated = false;
  function visit(current: unknown): unknown {
    if (typeof current === 'string' && !full && current.length > 1000) {
      truncated = true; return `${current.slice(0, 1000)}… (truncated, ${current.length} chars total)`;
    }
    if (Array.isArray(current)) return current.map(visit);
    if (current && typeof current === 'object') return Object.fromEntries(Object.entries(current).map(([key, child]) => [key, visit(child)]));
    return current;
  }
  return { data: visit(value), truncated };
}
export function detail(value: unknown, full: boolean | undefined, fullCommand: string): void {
  const result = compact(value, full);
  print({ data: result.data, ...(result.truncated ? { truncated: true, help: fullCommand } : {}) });
}
export function mutationResult(result: unknown): void {
  print(result ?? { ok: true });
  if (result && typeof result === 'object' && (result as JsonRecord).success === false) process.exitCode = 1;
}
