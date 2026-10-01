/** Structured CLI output. MCP stdio is deliberately a separate protocol. */
import { createRequire } from 'node:module';
const nativeRequire = createRequire(__filename);
let format: 'toon' | 'json' | 'text' = 'toon';
export function configureOutput(value: 'toon' | 'json' | 'text'): void {
  format = value;
}
export function print(value: unknown): void {
  const serialized = format === 'json' ? JSON.stringify(value) :
    (nativeRequire('@toon-format/toon') as { encode(value: unknown): string }).encode(value);
  process.stdout.write(serialized + '\n');
}
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.CI !== 'true');
}
export function supportsColor(): boolean {
  return isInteractive() && process.env.NO_COLOR === undefined && format === 'text';
}
export function success(msg: string): void {
  if (format === 'text') console.log(`OK ${msg}`);
  else print({ ok: true, message: msg });
}
export function error(msg: string, help?: string, context?: Record<string, unknown>): void {
  print({ error: msg, ...(help ? { help } : {}), ...context });
}
export function warn(msg: string): void { process.stderr.write(`WARN ${msg}\n`); }
export function info(msg: string): void { process.stderr.write(`INFO ${msg}\n`); }
export function dim(msg: string): string { return supportsColor() ? `\x1b[2m${msg}\x1b[0m` : msg; }
export function bold(msg: string): string { return supportsColor() ? `\x1b[1m${msg}\x1b[0m` : msg; }
export function table(rows: Record<string, string>[]): void {
  print({ count: rows.length, rows });
}
