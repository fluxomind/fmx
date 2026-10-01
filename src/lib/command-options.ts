import { Command, InvalidArgumentError } from 'commander';
import { readFileSync } from 'node:fs';
export type JsonRecord = Record<string, unknown>;
export interface PayloadOptions { data?: string; file?: string; tenant?: string; full?: boolean }
export interface ListOptions extends PayloadOptions { limit: number; offset: number; fields?: string; filters?: string; orderBy?: string }
export function integer(min: number, max: number) {
  return (value: string): number => {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new InvalidArgumentError(`Expected integer ${min}..${max}`);
    return Number(value);
  };
}
export function tenantOption(command: Command): Command { return command.option('--tenant <uuid>', 'Tenant (default: configured tenant)'); }
export function payloadOptions(command: Command): Command {
  return tenantOption(command).option('--data <json>', 'JSON payload').option('--file <path>', 'JSON file; - reads stdin');
}
export function listOptions(command: Command): Command {
  return tenantOption(command).option('--limit <count>', 'Page size (1..1000)', integer(1, 1000), 100)
    .option('--offset <count>', 'Rows to skip', integer(0, Number.MAX_SAFE_INTEGER), 0)
    .option('--fields <csv>', 'Fields to request from the server').option('--full', 'Complete text and fields')
    .option('--filters <json>', 'DataEngine filter map as JSON').option('--order-by <json>', 'DataEngine order map as JSON');
}
export function jsonValue(text: string, label: string): unknown {
  try { return JSON.parse(text); } catch { throw new InvalidArgumentError(`${label} must contain valid JSON`); }
}
export function jsonObject(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a JSON object`);
  return value as JsonRecord;
}
export function readPayload(opts: PayloadOptions): unknown {
  if ((opts.data === undefined) === (opts.file === undefined)) throw new InvalidArgumentError('Provide exactly one of --data <json> or --file <path|->');
  if (opts.data !== undefined) return jsonValue(opts.data, '--data');
  let contents: string;
  try { contents = readFileSync(opts.file === '-' ? 0 : opts.file!, 'utf8'); }
  catch { throw new InvalidArgumentError(`Cannot read JSON file: ${opts.file}`); }
  return jsonValue(contents, '--file');
}
export function objectPayload(opts: PayloadOptions): JsonRecord { return jsonObject(readPayload(opts), 'Payload'); }
export function fieldsOption(fields: string | undefined): string[] | undefined {
  if (fields === undefined) return undefined;
  const values = fields.split(',').map(field => field.trim());
  if (values.some(field => !field || ['__proto__', 'constructor', 'prototype'].includes(field))) throw new InvalidArgumentError('--fields requires nonempty field names');
  return [...new Set(values)];
}
export function objectOption(text: string | undefined, label: string): JsonRecord | undefined {
  return text === undefined ? undefined : jsonObject(jsonValue(text, label), label);
}
export function pathPart(value: string): string { return encodeURIComponent(value); }
