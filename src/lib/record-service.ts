import { apiRequest } from './api-client';
import { fieldsOption, objectOption, type JsonRecord, type ListOptions } from './command-options';
const base = '/api/v1/dataEngine';
export function recordPath(object: string, id?: string): string {
  const params = new URLSearchParams({ entityApiParam: object });
  if (id !== undefined) params.set('id', id);
  return `${base}?${params}`;
}
export interface RecordPage { success: boolean; data: JsonRecord[]; totalRecords?: number; error?: string; capabilities?: unknown; rowLimit?: { exact?: boolean; applied?: number; requested?: number; truncated?: boolean } }
export async function listRecords(object: string, opts: ListOptions, defaults?: string[]): Promise<RecordPage> {
  const fields = fieldsOption(opts.fields) ?? (opts.full ? undefined : defaults);
  const filters = objectOption(opts.filters, '--filters');
  const orderBy = objectOption(opts.orderBy, '--order-by') ?? { id: 'ASC' };
  const params = new URLSearchParams({ entityApiParam: object, limit: String(opts.limit + 1), offset: String(opts.offset) });
  if (fields) params.set('selectFields', JSON.stringify(fields));
  if (filters) params.set('filters', JSON.stringify(filters));
  if (orderBy) params.set('orderBy', JSON.stringify(orderBy));
  return apiRequest<RecordPage>({ method: 'GET', path: `${base}?${params}`, tenant: opts.tenant });
}
export function getRecord(object: string, id: string, tenant?: string): Promise<JsonRecord> { return apiRequest({ method: 'GET', path: recordPath(object, id), tenant }); }
export function createRecord(object: string, payload: JsonRecord, tenant?: string): Promise<JsonRecord> { return apiRequest({ method: 'POST', path: recordPath(object), body: { payload }, tenant }); }
export function updateRecord(object: string, id: string, payload: JsonRecord, tenant?: string, expectedValues?: JsonRecord): Promise<JsonRecord> {
  return apiRequest({ method: 'PUT', path: recordPath(object), body: { id, payload, ...(expectedValues ? { expectedValues } : {}) }, tenant });
}
export function deleteRecord(object: string, id: string, tenant?: string): Promise<unknown> { return apiRequest({ method: 'DELETE', path: recordPath(object, id), tenant }); }
