/**
 * Output formatting — CI detection, NO_COLOR, chalk/ora wrappers
 * @package @fluxomind/cli
 */

const isCI = process.env.CI === 'true' || !process.stdout.isTTY;
const noColor = process.env.NO_COLOR !== undefined;

export function isInteractive(): boolean {
  return !isCI;
}

export function supportsColor(): boolean {
  return !noColor && !isCI;
}

export function success(msg: string): void {
  console.log(supportsColor() ? `\x1b[32m✓\x1b[0m ${msg}` : `OK ${msg}`);
}

export function error(msg: string): void {
  console.error(supportsColor() ? `\x1b[31m✗\x1b[0m ${msg}` : `ERR ${msg}`);
}

export function warn(msg: string): void {
  console.warn(supportsColor() ? `\x1b[33m⚠\x1b[0m ${msg}` : `WARN ${msg}`);
}

export function info(msg: string): void {
  console.log(supportsColor() ? `\x1b[36mℹ\x1b[0m ${msg}` : `INFO ${msg}`);
}

export function dim(msg: string): string {
  return supportsColor() ? `\x1b[2m${msg}\x1b[0m` : msg;
}

export function bold(msg: string): string {
  return supportsColor() ? `\x1b[1m${msg}\x1b[0m` : msg;
}

export function table(rows: Record<string, string>[]): void {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)));
  const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  console.log(header);
  console.log(separator);
  for (const row of rows) {
    console.log(keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i])).join('  '));
  }
}
