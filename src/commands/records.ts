import { Command, InvalidArgumentError } from 'commander';
import { apiRequest, post } from '../lib/api-client';
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord, type RecordPage } from '../lib/record-service';
import { fieldsOption, listOptions, objectOption, objectPayload, payloadOptions, readPayload, tenantOption, type JsonRecord, type ListOptions, type PayloadOptions } from '../lib/command-options';
import { detail, mutationResult } from '../lib/platform-output';
import { print } from '../lib/output';
import { projectRows } from './inspect';
export const recordsCommand = new Command('records').description('Tenant records: CRUD, conditional writes, batches and aggregates');
export function pageResult(object: string, page: RecordPage, opts: ListOptions & { capabilities?: boolean }): void {
  if (!page.success || !Array.isArray(page.data)) throw new Error(page.error ?? 'Platform returned an invalid record page');
  const rows = page.data.slice(0, opts.limit);
  const defaults = ['id', 'name', 'title', 'api_name', 'status', 'is_active'].filter(field => rows.some(row => Object.hasOwn(row, field))).slice(0, 4);
  const projected = projectRows(rows, fieldsOption(opts.fields) ?? (opts.full ? undefined : defaults), opts.full);
  // DataEngine falls back to data.length when COUNT was not executed. Only exact counts are totals.
  const total = page.rowLimit?.exact && typeof page.totalRecords === 'number' ? page.totalRecords : null;
  const ceilingReached = typeof page.rowLimit?.applied === 'number' && page.rowLimit.applied < opts.limit + 1 && page.data.length >= page.rowLimit.applied;
  const hasMore = page.data.length > opts.limit ? true : total !== null ? opts.offset + rows.length < total : ceilingReached ? null : false;
  const args = ['records', 'list', object, '--offset', String(opts.offset + rows.length), '--limit', String(opts.limit)];
  for (const [flag, value] of [['--tenant', opts.tenant], ['--fields', opts.fields], ['--filters', opts.filters], ['--order-by', opts.orderBy]]) if (value !== undefined) args.push(flag!, value!);
  if (opts.full) args.push('--full');
  if (opts.capabilities) args.push('--capabilities');
  const capabilities = page.capabilities && typeof page.capabilities === 'object' ? Object.fromEntries(Object.entries(page.capabilities).filter(([id]) => rows.some(row => String(row.id) === id))) : null;
  print({ object, count: rows.length, total, offset: opts.offset, hasMore, records: projected.rows,
    ...(opts.capabilities ? { capabilities } : {}),
    ...(page.rowLimit?.truncated || ceilingReached ? { rowLimit: page.rowLimit } : {}),
    ...(projected.truncated ? { truncated: true, full: { command: 'fmx', args: args.map((arg, index) => index === args.indexOf('--offset') + 1 ? String(opts.offset) : arg).concat('--full') } } : {}),
    ...(hasMore ? { next: { command: 'fmx', args } } : {}) });
}

listOptions(recordsCommand.command('list <object>').description('List records with server filters, ordering and fields'))
  .option('--capabilities', 'Include server-provided allowed actions')
  .addHelpText('after', '\nExamples:\n  fmx records list fm__agent --fields id,name,is_active\n  fmx records list fm__object --filters \'{"api_name":"fm__agent"}\'')
  .action(async (object: string, opts: ListOptions) => pageResult(object, await listRecords(object, opts), opts));
tenantOption(recordsCommand.command('get <object> <id>').description('Read a record and its allowed actions'))
  .option('--full', 'Complete text').action(async (object: string, id: string, opts: PayloadOptions) => detail(await getRecord(object, id, opts.tenant), opts.full, `fmx records get ${object} ${id} --full`));
payloadOptions(recordsCommand.command('create <object>').description('Create a record from JSON or a file'))
  .action(async (object: string, opts: PayloadOptions) => mutationResult(await createRecord(object, objectPayload(opts), opts.tenant)));
payloadOptions(recordsCommand.command('update <object> <id>').description('Update a record; --expected enables server compare-and-swap'))
  .option('--expected <json>', 'Expected field values for conditional update')
  .action(async (object: string, id: string, opts: PayloadOptions & { expected?: string }) => {
    const payload = objectPayload(opts); const expected = objectOption(opts.expected, '--expected');
    mutationResult(await updateRecord(object, id, payload, opts.tenant, expected));
  });
tenantOption(recordsCommand.command('delete <object> <id>').description('Delete the specified record without interactive prompts'))
  .action(async (object: string, id: string, opts: PayloadOptions) => mutationResult(await deleteRecord(object, id, opts.tenant)));
const batch = recordsCommand.command('batch').description('Batch operations; partial failures return exit 1 and preserve results');
for (const operation of ['create', 'update', 'upsert', 'remove'] as const) {
  const command = payloadOptions(batch.command(`${operation} <object>`).description(operation === 'remove' ? 'JSON array of record IDs' : operation === 'update' ? 'JSON array of {id,data}; conditional writes require records update' : 'JSON array of records'))
    .option('--stop-on-error', 'Stop the server batch on its first error')
    .option('--continue-on-error', 'Request per-item error reporting instead of stopping');
  if (operation === 'upsert') command.option('--match-field <field>', 'Match existing records by this field');
  command.action(async (object: string, opts: PayloadOptions & { stopOnError?: boolean; continueOnError?: boolean; matchField?: string }) => {
    if (opts.stopOnError && opts.continueOnError) throw new InvalidArgumentError('--stop-on-error and --continue-on-error are mutually exclusive');
    const value = readPayload(opts);
    if (!Array.isArray(value) || value.length === 0 || value.length > (operation === 'update' ? 200 : 10000)) throw new InvalidArgumentError(`Batch payload must be an array of 1..${operation === 'update' ? 200 : 10000} items; tenant limits also apply`);
    if (operation === 'remove') {
      if (value.some(id => !(typeof id === 'string' && id.length > 0) && !(typeof id === 'number' && Number.isFinite(id)))) throw new InvalidArgumentError('Batch remove requires record IDs');
    } else {
      for (const record of value) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new InvalidArgumentError('Batch records must be JSON objects');
        if (operation === 'update' && ('expectedValues' in record || !record.id || !record.data || typeof record.data !== 'object' || Array.isArray(record.data))) throw new InvalidArgumentError('Batch update requires {id,data} and does not support expectedValues; use records update --expected');
      }
    }
    const body = { entity: object, [operation === 'remove' ? 'ids' : 'records']: value, ...(opts.stopOnError ? { stopOnError: true } : opts.continueOnError ? { stopOnError: false } : {}), ...(opts.matchField ? { matchField: opts.matchField } : {}) };
    mutationResult(await post(`/api/v1/dataEngine/batch/${operation}`, body, opts.tenant));
  });
}
tenantOption(recordsCommand.command('aggregate <object> <operation> <field>').description('Server aggregate: COUNT, SUM, AVG, MIN, MAX and statistical aggregates'))
  .option('--filters <json>', 'DataEngine filter map')
  .action(async (object: string, operation: string, field: string, opts: PayloadOptions & { filters?: string }) => {
    const op = operation.toUpperCase();
    if (!['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'MEDIAN', 'COUNT_DISTINCT', 'COUNT_NULL', 'COUNT_NOT_NULL', 'PERCENT_NULL', 'PERCENT_NOT_NULL', 'PERCENT_DISTINCT', 'RANGE'].includes(op)) throw new InvalidArgumentError('Unsupported aggregate operation; see records aggregate --help');
    const filters = objectOption(opts.filters, '--filters');
    const result = await apiRequest<{ value: number | null; error?: string }>({ method: 'POST', path: '/api/v1/dataEngine/aggregate', body: { entityApiName: object, field, operation: op, ...(filters ? { filters } : {}) }, tenant: opts.tenant });
    mutationResult(result);
    if (result.error) process.exitCode = 1;
  });
