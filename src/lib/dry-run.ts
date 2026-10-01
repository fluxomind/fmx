let enabled = false;
export function setDryRun(value: boolean): void { enabled = value; }
export function isDryRun(): boolean { return enabled; }
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /token|secret|password|credential|api[_-]?key|authorization/i.test(key) ? '[redacted]' : redact(child)]));
  return value;
}
export class DryRunPreview extends Error {
  readonly preview: unknown;
  constructor(method: string, path: string, body: unknown) {
    super('Dry run'); this.name = 'DryRunPreview';
    this.preview = { dryRun: true, scope: 'request-preview', writesPerformed: false, request: { method, path, body: redact(body) },
      warning: 'Stopped before this write. Earlier GET requests may have occurred; no write permissions or downstream effects were verified.' };
  }
}
