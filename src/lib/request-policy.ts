let readOnly = false;
export function setReadOnly(value: boolean): void { readOnly = value; }
export function isReadOnly(): boolean { return readOnly || process.env.FMX_READ_ONLY === '1'; }
export class ReadOnlyError extends Error {
  readonly code = 'READ_ONLY_MODE';
  constructor() { super('Only GET requests are allowed in read-only mode. Use --dry-run to preview a write without sending it.'); this.name = 'ReadOnlyError'; }
}
