import { Command, InvalidArgumentError } from 'commander';
import { get, post } from '../lib/api-client';
import { print } from '../lib/output';
interface ReadOptions { tenant?: string; limit: number; offset: number; fields?: string; full?: boolean; filters?: string }
function integer(min: number, max: number) {
  return (value: string): number => {
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new InvalidArgumentError(`Expected integer ${min}..${max}`);
    return Number(value);
  };
}
function options(command: Command, max = 1000): Command {
  return command.option('--tenant <uuid>', 'Tenant (default: configured tenant)')
    .option('--limit <count>', `Page size (1..${max})`, integer(1, max), 100)
    .option('--offset <count>', 'Rows to skip', integer(0, Number.MAX_SAFE_INTEGER), 0)
    .option('--fields <csv>', 'Explicit output fields')
    .option('--full', 'Include complete text and all fields');
}
function fieldNames(opts: ReadOptions, fallback: string[]): string[] | undefined {
  if (opts.fields !== undefined) {
    const fields = opts.fields.split(',').map(s => s.trim());
    if (fields.some(f => !f || ['__proto__', 'constructor', 'prototype'].includes(f))) throw new InvalidArgumentError('--fields must contain nonempty field names');
    return fields;
  }
  return opts.full ? undefined : fallback;
}
export function projectRows(rows: Record<string, unknown>[], fields: string[] | undefined, full = false) {
  let truncated = false;
  const result = rows.map(row => Object.fromEntries((fields ?? Object.keys(row)).map(key => {
    const value = row[key] ?? null;
    if (!full && typeof value === 'string' && value.length > 1000) {
      truncated = true;
      return [key, `${value.slice(0, 1000)}… (truncated, ${value.length} chars total)`];
    }
    return [key, value];
  })));
  return { rows: result, truncated };
}
export const metadataCommand = new Command('metadata').description('Read tenant object and field metadata');
options(metadataCommand.command('list').description('List objects (default fields: id,apiName,label)'), 199)
  .option('--prefix <prefix>', 'Filter object API names by prefix')
  .action(async (opts: ReadOptions & { prefix?: string }) => {
    const fields = fieldNames(opts, ['id', 'apiName', 'label']);
    const response = await get<{ objects: Record<string, unknown>[] }>(`/api/v1/metadata/objects?limit=${opts.limit + 1}&offset=${opts.offset}${opts.prefix ? `&prefix=${encodeURIComponent(opts.prefix)}` : ''}`, opts.tenant);
    const result = projectRows(response.objects.slice(0, opts.limit), fields, opts.full);
    print({ count: result.rows.length, total: null, hasMore: response.objects.length > opts.limit, offset: opts.offset, objects: result.rows,
      ...(response.objects.length > opts.limit ? { help: `fmx metadata list --offset ${opts.offset + result.rows.length} --limit ${opts.limit}${opts.tenant ? ` --tenant ${opts.tenant}` : ''}${opts.prefix ? ` --prefix ${opts.prefix}` : ''}` } : {}),
      ...(result.truncated ? { truncated: true, full: `fmx metadata list --full${opts.tenant ? ` --tenant ${opts.tenant}` : ''}` } : {}) });
  });
options(metadataCommand.command('view <object>').description('View object fields (default fields: apiName,type,isRequired)'))
  .action(async (object: string, opts: ReadOptions) => {
    const fields = fieldNames(opts, ['apiName', 'type', 'isRequired']);
    const response = await get<{ fields: Record<string, unknown>[] }>(`/api/v1/metadata/objects/${encodeURIComponent(object)}/fields`, opts.tenant);
    const result = projectRows(response.fields.slice(opts.offset, opts.offset + opts.limit), fields, opts.full);
    print({ object, count: result.rows.length, total: response.fields.length < 200 ? response.fields.length : null, offset: opts.offset, fields: result.rows, sourceLimit: 200, hasMore: opts.offset + result.rows.length < response.fields.length ? true : response.fields.length === 200 ? null : false,
      ...(result.truncated ? { help: `fmx metadata view ${object} --full${opts.tenant ? ` --tenant ${opts.tenant}` : ''}` } : {}) });
  });
export const queryCommand = options(new Command('query').description('Read records (default fields when present: id,name,api_name,status)').argument('<object>'))
  .option('--filters <json>', 'Filter object as JSON; validated before network access')
  .action(async (object: string, opts: ReadOptions, command: Command) => {
    const fields = fieldNames(opts, ['id', 'name', 'api_name', 'status']);
    let filters: unknown;
    if (opts.filters !== undefined) {
      try { filters = JSON.parse(opts.filters); if (!filters || Array.isArray(filters) || typeof filters !== 'object') throw new Error(); }
      catch { command.error('--filters must be a JSON object', { exitCode: 2 }); }
    }
    const response = await post<{ records: Record<string, unknown>[]; total?: number; hasMore?: boolean }>('/api/code-engine/query', { object, filters, limit: opts.limit, offset: opts.offset }, opts.tenant);
    const selected = !opts.fields && !opts.full ? fields?.filter(key => response.records.some(row => Object.hasOwn(row, key))) : fields;
    const result = projectRows(response.records, selected, opts.full);
    print({ object, count: result.rows.length, total: response.total ?? null, offset: opts.offset, hasMore: response.hasMore ?? null, records: result.rows,
      ...(result.truncated ? { help: `fmx query ${object} --full${opts.tenant ? ` --tenant ${opts.tenant}` : ''}` } : {}) });
  });
