import { createHash } from 'node:crypto';
import { InvalidArgumentError } from 'commander';
import { z } from 'zod';
import { apiRequest, get } from './api-client';
import { resolveApiUrl } from './config-manager';
import { getRecord, listRecords, recordPath, type RecordPage } from './record-service';
import { remoteIdentity } from './remote-identity';
import { mapLimited } from './concurrency';
import { isDryRun } from './dry-run';
import { isReadOnly, ReadOnlyError } from './request-policy';
import type { JsonRecord } from './command-options';

const kinds: Record<string, string> = { object: 'fm__object', page: 'fm__page', agent: 'fm__agent', process: 'fm__workflow_definition' };
const PAGE = 200;
const MAX_ROWS = 200_000;
const key = (entity: string, id: string) => `${entity}:${id}`;
const eq = (value: unknown) => ({ operator: 'eq', value });
const inside = (value: unknown[]) => ({ operator: 'in', value });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface DeleteOptions { tenant?: string; expectedTenant?: string; withData?: boolean; includeObjects?: string[]; onProgress?: (message: string) => void }
export interface DeleteIO {
  identity(tenant?: string): Promise<{ tenantId: string; userId: string }>;
  origin(): string;
  record(entity: string, id: string, tenant?: string): Promise<JsonRecord>;
  page(entity: string, fields: string[], filters: JsonRecord, offset: number, tenant?: string): Promise<RecordPage>;
  write(entity: string, id: string, tenant?: string): Promise<unknown>;
  pendingJobs(tenant?: string): Promise<{ id: string; status: string }[]>;
}
const liveIO: DeleteIO = {
  identity: remoteIdentity, origin: resolveApiUrl, record: getRecord,
  page: (entity, fields, filters, offset, tenant) => listRecords(entity, { tenant, limit: PAGE - 1, offset, fields: fields.join(','), filters: JSON.stringify(filters) }),
  write: (entity, id, tenant) => apiRequest({ method: 'DELETE', path: entity === 'fm__workflow_definition' ? `/api/workflow/definitions/${encodeURIComponent(id)}` : recordPath(entity, id), tenant, retries: 0 }),
  pendingJobs: async tenant => {
    const seen = new Set<string>(); const pending: { id: string; status: string }[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const response = await get<{ success?: boolean; data?: { items?: { jobId?: string; status?: string }[]; limit?: number } }>(`/api/v1/queueEngine/jobs?limit=${PAGE}&offset=${offset}`, tenant);
      if (response.success === false || !Array.isArray(response.data?.items) || response.data.limit !== PAGE) throw new Error('Queue inventory/pagination could not be verified');
      for (const job of response.data.items) {
        if (!job.jobId || !job.status || seen.has(job.jobId)) throw new Error('Queue job identity/status or pagination could not be verified');
        seen.add(job.jobId);
        if (!['completed', 'succeeded', 'failed', 'cancelled', 'dead'].includes(job.status)) pending.push({ id: job.jobId, status: job.status });
      }
      if (response.data.items.length < PAGE) return pending;
    }
    throw new Error('Queue inventory limit reached');
  },
};
export interface DeleteResource { entity: string; id: string; name?: string; apiName?: string; source: 'member' | 'explicit' | 'application'; }
export interface DeleteBlocker { code: string; target: string; message: string }
export interface DeleteOperation { entity: string; id: string; reason: string }
export interface AppDeletePlan {
  apiVersion: 'fmx/app-delete-v1'; apiOrigin: string; tenant: string; userId: string;
  app: { id: string; name: string; namespace: string; status: string };
  options: { withData: boolean; includeObjects: string[] };
  resources: DeleteResource[]; preserved: DeleteResource[];
  data: { object: string; count: number; complete: boolean; idsDigest: string }[];
  cascades: { entity: string; count: number; idsDigest: string; ids: string[] }[];
  preservedData: { object: string; count: number; idsDigest: string }[];
  blockers: DeleteBlocker[]; operations: DeleteOperation[];
  checks: { entity: string; fields: string[]; filters: JsonRecord; idsDigest: string }[];
  fingerprint: string; executable: boolean; writesPerformed: false;
}

export function validateDeleteInput(id: string, options: DeleteOptions, confirm?: string, dryRun = false): void {
  if (!z.uuid().safeParse(id).success) throw new InvalidArgumentError('App id must be a UUID');
  if (!dryRun && confirm !== id) throw new InvalidArgumentError('Deletion requires --confirm with the exact app UUID');
  if (options.expectedTenant && !z.uuid().safeParse(options.expectedTenant).success) throw new InvalidArgumentError('--expected-tenant must be a UUID');
  if ((options.includeObjects ?? []).some(value => !z.uuid().safeParse(value).success)) throw new InvalidArgumentError('--include-object must be a UUID');
}

/** Exhaust the visible collection; repeated IDs and ambiguous caps are failures, never zero. */
export async function allDeleteRows(io: DeleteIO, entity: string, fields: string[], filters: JsonRecord, tenant?: string, budget = MAX_ROWS): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = []; const seen = new Set<string>(); let offset = 0;
  while (true) {
    const result = await io.page(entity, fields, filters, offset, tenant);
    if (result.success !== true || !Array.isArray(result.data)) throw new Error(result.error ?? `Invalid collection response: ${entity}`);
    const applied = result.rowLimit?.applied ?? PAGE;
    if (!Number.isInteger(applied) || applied < 1 || applied > PAGE || result.data.length > applied) throw new Error(`Unverifiable page limit: ${entity}`);
    for (const row of result.data) {
      if (typeof row.id !== 'string' || !row.id || seen.has(row.id)) throw new Error(`Missing/repeated record identity: ${entity}`);
      if (fields.some(field => !Object.hasOwn(row, field))) throw new Error(`Unreadable requested fields: ${entity}`);
      seen.add(row.id); rows.push(Object.fromEntries(fields.map(field => [field, row[field]])));
    }
    if (result.data.length < applied) return rows;
    if (rows.length >= budget) throw Object.assign(new Error(`Inventory limit reached (${budget}): ${entity}`), { observedCount: rows.length, idsDigest: idsDigest(rows) });
    offset += result.data.length;
  }
}

function rowsDigest(rows: JsonRecord[]): string { return digest([...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))); }
function idsDigest(rows: JsonRecord[]): string { return digest(rows.map(r => r.id).sort()); }
export function appDeleteFingerprint(plan: AppDeletePlan): string {
  return digest({ apiOrigin: plan.apiOrigin, tenant: plan.tenant, userId: plan.userId, app: plan.app, options: plan.options,
    resources: plan.resources, preserved: plan.preserved, preservedData: plan.preservedData, data: plan.data, cascades: plan.cascades, checks: plan.checks, blockers: plan.blockers, operations: plan.operations });
}

export async function buildAppDeletePlan(id: string, opts: DeleteOptions, io = liveIO): Promise<AppDeletePlan> {
  validateDeleteInput(id, opts, undefined, true);
  const identity = await io.identity(opts.tenant);
  if (opts.expectedTenant && identity.tenantId !== opts.expectedTenant) throw new Error('Authenticated tenant differs from --expected-tenant');
  const app = await io.record('fm__application', id, opts.tenant);
  if (app.id !== id || typeof app.status !== 'string' || typeof app.namespace !== 'string' || typeof app.name !== 'string') throw new Error('App identity/status/namespace could not be verified');
  if (app.tenant_id !== undefined && app.tenant_id !== identity.tenantId) throw new Error('App belongs to a different tenant');
  const plan: AppDeletePlan = { apiVersion: 'fmx/app-delete-v1', apiOrigin: io.origin(), tenant: identity.tenantId, userId: identity.userId,
    app: { id, name: app.name, namespace: app.namespace, status: app.status }, options: { withData: !!opts.withData, includeObjects: [...new Set(opts.includeObjects ?? [])].sort() },
    resources: [], preserved: [], preservedData: [], data: [], cascades: [], blockers: [], operations: [], checks: [], fingerprint: '', executable: false, writesPerformed: false };
  const block = (code: string, target: string, message: string) => {
    if (!plan.blockers.some(b => b.code === code && b.target === target && b.message === message)) plan.blockers.push({ code, target, message });
  };
  const observations = new Map<string, JsonRecord[]>();
  const observe = async (entity: string, fields: string[], filters: JsonRecord): Promise<JsonRecord[]> => {
    const lookup = JSON.stringify([entity, fields, filters]);
    if (observations.has(lookup)) return observations.get(lookup)!;
    try {
      const rows = await allDeleteRows(io, entity, fields, filters, opts.tenant);
      observations.set(lookup, rows); plan.checks.push({ entity, fields, filters, idsDigest: rowsDigest(rows) }); return rows;
    } catch (err) { block('INVENTORY_UNVERIFIED', entity, (err as Error).message); return []; }
  };
  opts.onProgress?.('Inspecting application membership and exclusive resources');
  if (app.status !== 'draft') block('APP_NOT_DRAFT', id, `Status is ${app.status}; only draft apps can be deleted`);
  const members = await observe('fm__application_member', ['id', 'application_id', 'primitive_kind', 'primitive_ref'], { application_id: eq(id) });
  const wanted: DeleteResource[] = [];
  for (const m of members) {
    const entity = kinds[String(m.primitive_kind)];
    if (!entity || typeof m.primitive_ref !== 'string') { block('UNSUPPORTED_PRIMITIVE', String(m.id), `No full deletion contract for primitive kind ${String(m.primitive_kind)}`); continue; }
    if (!wanted.some(r => key(r.entity, r.id) === key(entity, String(m.primitive_ref)))) wanted.push({ entity, id: m.primitive_ref, source: 'member' });
  }
  for (const objectId of plan.options.includeObjects) if (!wanted.some(r => r.entity === 'fm__object' && r.id === objectId)) wanted.push({ entity: 'fm__object', id: objectId, source: 'explicit' });
  // Shared primitives are preserved. No delete based on a namespace/name match alone.
  const refs: JsonRecord[] = [];
  for (let i = 0; i < wanted.length; i += 100) refs.push(...await observe('fm__application_member', ['id', 'application_id', 'primitive_kind', 'primitive_ref'], { primitive_ref: inside(wanted.slice(i, i + 100).map(r => r.id)) }));
  for (const resource of wanted) {
    let record: JsonRecord;
    try {
      record = await io.record(resource.entity, resource.id, opts.tenant);
      if (record.id !== resource.id) throw new Error('Record identity was not returned');
    if (record.tenant_id !== undefined && record.tenant_id !== identity.tenantId) throw new Error('Resource belongs to another tenant');
    } catch (err) { block('RESOURCE_UNVERIFIED', key(resource.entity, resource.id), `Missing/inaccessible is not proven absent: ${(err as Error).message}`); continue; }
    if (typeof record.name === 'string') resource.name = record.name;
    if (typeof record.api_name === 'string') resource.apiName = record.api_name;
    const shared = refs.some(r => r.primitive_ref === resource.id && r.primitive_kind === Object.keys(kinds).find(k => kinds[k] === resource.entity) && r.application_id !== id);
    if (resource.entity === 'fm__object' && !shared) {
      const coreFlag = (record.extra_metadata as JsonRecord | null)?.core_platform;
      if (!resource.apiName || resource.apiName.startsWith('fm__') || record.is_global === true || coreFlag === true || coreFlag === 'true') {
        block('PROTECTED_OBJECT', resource.id, 'Cannot physically remove a system/global/core object'); continue;
      }
      if (record.tenant_id !== identity.tenantId) { block('OBJECT_OWNER_UNVERIFIED', resource.id, 'Physical deletion requires the readable object tenant_id to match the authenticated tenant'); continue; }
    }
    (shared ? plan.preserved : plan.resources).push(resource);
  }
  plan.resources.push({ entity: 'fm__application', id, name: plan.app.name, source: 'application' });
  const objects = plan.resources.filter(r => r.entity === 'fm__object');
  opts.onProgress?.(`Counting visible data in ${objects.length} exclusive objects`);
  // Once a root resource is unverifiable, a full data sweep cannot authorize deletion.
  // Return an explicitly incomplete diagnostic sample instead of spending thousands of reads.
  const dataBudget = plan.blockers.length ? PAGE : MAX_ROWS;
  await mapLimited(objects, 4, async object => {
    try {
      const rows = await allDeleteRows(io, object.apiName!, ['id'], {}, opts.tenant, dataBudget);
      plan.data.push({ object: object.apiName!, count: rows.length, complete: true, idsDigest: idsDigest(rows) });
      if (rows.length && !opts.withData) block('DATA_CONFIRMATION_REQUIRED', object.apiName!, 'App has data; add --with-data to explicitly include its destruction');
      opts.onProgress?.(`Counted ${object.apiName}: ${rows.length} visible records`);
    } catch (err) {
      const e = err as Error & { observedCount?: number; idsDigest?: string };
      plan.data.push({ object: object.apiName!, count: e.observedCount ?? 0, complete: false, idsDigest: e.idsDigest ?? '' });
      block('DATA_UNVERIFIED', object.apiName!, `${e.message}${dataBudget === PAGE ? '; full sweep deferred because resource preflight is already blocked' : ''}`);
    }
  });
  await mapLimited(plan.preserved.filter(r => r.entity === 'fm__object'), 4, async object => {
    if (!object.apiName) { block('PRESERVED_RESOURCE_UNVERIFIED', object.id, 'Preserved object has no readable API name'); return; }
    try {
      const rows = await allDeleteRows(io, object.apiName, ['id'], {}, opts.tenant);
      plan.preservedData.push({ object: object.apiName, count: rows.length, idsDigest: idsDigest(rows) });
    } catch (err) { block('PRESERVED_RESOURCE_UNVERIFIED', object.apiName, (err as Error).message); }
  });

  const cuts: DeleteOperation[] = [];
  if (objects.length) {
    opts.onProgress?.('Inspecting structural references, name bindings and lifecycle reservations');
    const relations = await observe('fm__field', ['id', 'object_id', 'api_name', 'parent_object_id', 'on_delete'], { parent_object_id: inside(objects.map(o => o.id)) });
    for (const relation of relations) {
      if (!objects.some(o => o.id === relation.object_id)) block('EXTERNAL_OBJECT_REFERENCE', String(relation.id), `Field ${String(relation.api_name)} belongs to object ${String(relation.object_id)} outside the deletion scope`);
      else cuts.push({ entity: 'fm__field', id: String(relation.id), reason: 'Remove internal relation before dropping its owned tables' });
    }
    // Confirmed text binding: not covered by fm__object FK cascades (platform FLY-026).
    const bindings = await observe('fm__sharing_profile_object', ['id', 'object_api_name'], { object_api_name: inside(objects.map(o => o.apiName!)) });
    cuts.push(...bindings.map(row => ({ entity: 'fm__sharing_profile_object', id: String(row.id), reason: 'Remove name-scoped binding for an explicitly selected object' })));
    // Lifecycle aliases/reservations cannot be purged safely via generic record deletion.
    const ownedFields = await observe('fm__field', ['id', 'object_id'], { object_id: inside(objects.map(o => o.id)) });
    const elementRefs = [...objects.map(o => o.id), ...ownedFields.map(f => String(f.id))];
    for (let i = 0; i < elementRefs.length; i += 100) {
      const history = await observe('fm__schema_evolution_ledger', ['id', 'element_ref'], { element_ref: inside(elementRefs.slice(i, i + 100)) });
      if (history.length) block('LIFECYCLE_HISTORY', 'fm__schema_evolution_ledger', 'Lifecycle history may reserve object/field names; requires a server cleanup contract, not a generic ledger delete');
    }
  }

  const processes = plan.resources.filter(r => r.entity === 'fm__workflow_definition');
  if (processes.length) {
    const runs = await observe('fm__workflow_run', ['id', 'workflow_definition_id', 'status'], { workflow_definition_id: inside(processes.map(r => r.id)) });
    for (const run of runs) if (!['completed', 'failed', 'cancelled', 'resolved'].includes(String(run.status))) block('ACTIVE_WORKFLOW_RUN', String(run.id), `Run status ${String(run.status)} must be stopped and verified before deletion`);
  }
  // Payload references are not FKs. Inspect only IDs/status and project no credential payloads.
  if (objects.length || processes.length || plan.resources.some(r => r.entity === 'fm__agent')) {
    opts.onProgress?.('Inspecting schedules and queue activity');
    const schedules = await allDeleteRows(io, 'fm__queue_schedule', ['id', 'status', 'job_payload_template'], {}, opts.tenant).catch(err => { block('SCHEDULES_UNVERIFIED', 'fm__queue_schedule', err.message); return []; });
    const tokens = [...plan.resources.flatMap(r => [r.id, r.apiName].filter((v): v is string => !!v))];
    for (const schedule of schedules) {
      const values = JSON.stringify(schedule.job_payload_template);
      if (values && tokens.some(t => values.includes(t))) block('REFERENCING_SCHEDULE', String(schedule.id), 'Schedule references an app resource; archive it through the schedule service before cleanup');
    }
    try {
      const jobs = await io.pendingJobs(opts.tenant);
      for (const job of jobs) block('QUEUE_ACTIVITY_UNVERIFIED', job.id, `Job status ${job.status}; the API omits payloads, so its relationship to this app cannot be verified. Do not cancel unrelated jobs to bypass this check.`);
    } catch (err) { block('QUEUE_UNVERIFIED', 'queueEngine', (err as Error).message); }
  }
  await inspectCascades(plan, observe, block, opts.onProgress);
  plan.resources.sort((a, b) => key(a.entity, a.id).localeCompare(key(b.entity, b.id)));
  plan.preserved.sort((a, b) => key(a.entity, a.id).localeCompare(key(b.entity, b.id)));
  plan.data.sort((a, b) => a.object.localeCompare(b.object));
  plan.preservedData.sort((a, b) => a.object.localeCompare(b.object));
  // Restrict/root operations are ordered; each server DELETE may cascade transactionally.
  plan.operations = [...cuts, ...plan.resources.filter(r => r.entity !== 'fm__application').map(r => ({ entity: r.entity, id: r.id, reason: 'Delete explicitly selected exclusive primitive' })), { entity: 'fm__application', id, reason: 'Delete app last, including its native child cascades' }];
  plan.operations = plan.operations.filter((op, i, all) => all.findIndex(other => key(op.entity, op.id) === key(other.entity, other.id)) === i);
  plan.checks.sort((a, b) => JSON.stringify([a.entity, a.fields, a.filters]).localeCompare(JSON.stringify([b.entity, b.fields, b.filters])));
  plan.blockers.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  plan.executable = plan.blockers.length === 0;
  plan.fingerprint = appDeleteFingerprint(plan);
  opts.onProgress?.(`Inventory complete: ${plan.blockers.length} blockers`);
  return plan;
}

/** Follow native cascade metadata recursively; unknown restrictions are not detached/forced. */
async function inspectCascades(plan: AppDeletePlan, observe: (entity: string, fields: string[], filters: JsonRecord) => Promise<JsonRecord[]>, block: (code: string, target: string, message: string) => void, progress?: (message: string) => void): Promise<void> {
  const nodes = new Map<string, Set<string>>();
  for (const r of plan.resources) { if (!nodes.has(r.entity)) nodes.set(r.entity, new Set()); nodes.get(r.entity)!.add(r.id); }
  const processed = new Map<string, Set<string>>();
  for (let depth = 0; depth < 12; depth++) {
    const pending = [...nodes].map(([entity, ids]) => ({ entity, ids: [...ids].filter(id => !processed.get(entity)?.has(id)) })).filter(x => x.ids.length);
    if (!pending.length) { plan.cascades = [...nodes].map(([entity, ids]) => ({ entity, count: ids.size, idsDigest: digest([...ids].sort()), ids: [...ids].sort() })).sort((a, b) => a.entity.localeCompare(b.entity)); return; }
    for (const parent of pending) {
      progress?.(`Inspecting native cascades of ${parent.entity}: ${parent.ids.length} records`);
      processed.set(parent.entity, new Set(nodes.get(parent.entity)));
      const metadata = await observe('fm__object', ['id', 'api_name'], { api_name: eq(parent.entity) });
      if (metadata.length !== 1) { block('METADATA_UNVERIFIED', parent.entity, 'Expected exactly one metadata identity'); continue; }
      const edges = await observe('fm__field', ['id', 'object_id', 'api_name', 'on_delete', 'relationship_type'], { parent_object_id: eq(metadata[0].id) });
      for (const edge of edges) {
        const policy = String(edge.on_delete).replace('_', '').toUpperCase();
        // Audit actor annotations do not make the annotated records owned by the agent.
        if (policy === 'SETNULL' && ['created_by_agent_id', 'modified_by_agent_id'].includes(String(edge.api_name))) continue;
        const childMeta = await observe('fm__object', ['id', 'api_name'], { id: eq(edge.object_id) });
        if (childMeta.length !== 1) { block('METADATA_UNVERIFIED', String(edge.object_id), 'Child metadata not uniquely readable'); continue; }
        const child = String(childMeta[0].api_name);
        for (let start = 0; start < parent.ids.length; start += 100) {
          const rows = await observe(child, ['id', String(edge.api_name)], { [String(edge.api_name)]: inside(parent.ids.slice(start, start + 100)) });
          if (!rows.length) continue;
          if (parent.entity === 'fm__object' && child === 'fm__field' && edge.api_name === 'parent_object_id') continue; // handled by structural external-reference check
          if (rows.some(row => plan.preserved.some(p => p.entity === child && p.id === row.id))) { block('SHARED_CASCADE', child, 'Cascade would affect a preserved resource'); continue; }
          const ownAppEdge = parent.entity === 'fm__application' && ['fm__application_menu', 'fm__application_member', 'fm__application_channel', 'fm__page'].includes(child) && edge.api_name === 'application_id';
          if (policy !== 'CASCADE') { block('REFERENTIAL_DEPENDENCY', `${child}.${String(edge.api_name)}`, `${rows.length} referenced records with ${policy}; no automatic detach, ledger purge or dependency deletion`); continue; }
          if (edge.relationship_type !== 'MASTER_DETAIL' && !ownAppEdge) { block('CASCADE_OWNERSHIP_UNVERIFIED', `${child}.${String(edge.api_name)}`, 'Non-owner cascade requires a server domain cleanup contract'); continue; }
          if (/deleted_records|audit_trail/.test(child)) { block('AUDIT_CASCADE', child, 'Deletion would cascade into retained audit records'); continue; }
          if (!nodes.has(child)) nodes.set(child, new Set());
          for (const row of rows) nodes.get(child)!.add(String(row.id));
        }
      }
    }
  }
  block('CASCADE_DEPTH_LIMIT', plan.app.id, 'Cascade graph exceeded the verification limit');
}

export async function applyAppDeletePlan(plan: AppDeletePlan, opts: DeleteOptions, confirm: string, receipt: (result: JsonRecord) => void, io = liveIO): Promise<JsonRecord> {
  validateDeleteInput(plan.app.id, opts, confirm);
  if (isReadOnly()) throw new ReadOnlyError();
  if (isDryRun()) throw new Error('Use the command dry-run path; apply does not run in preview mode');
  if (!plan.executable || plan.blockers.length || plan.fingerprint !== appDeleteFingerprint(plan)) throw new Error('Blocked or modified app deletion plan');
  if (io.origin() !== plan.apiOrigin) throw new Error('API origin changed');
  const fresh = await buildAppDeletePlan(plan.app.id, opts, io);
  if (!fresh.executable || fresh.fingerprint !== plan.fingerprint) throw new Error('Remote app inventory changed; regenerate the dry run');
  const results: JsonRecord[] = [];
  const base = { apiVersion: plan.apiVersion, appId: plan.app.id, tenant: plan.tenant, apiOrigin: plan.apiOrigin, fingerprint: plan.fingerprint, atomic: false };
  // Persist the intended operation BEFORE any request; an interrupted/unknown write is visible.
  for (const op of plan.operations) {
    receipt({ ...base, success: false, outcome: 'in_progress', results, pending: op, remaining: plan.operations.slice(results.length + 1) });
    let requestStarted = false;
    try {
      const identity = await io.identity(opts.tenant);
      if (identity.tenantId !== plan.tenant || identity.userId !== plan.userId || io.origin() !== plan.apiOrigin) throw new Error('Authenticated target changed');
      const currentApp = await io.record('fm__application', plan.app.id, opts.tenant);
      if (currentApp.id !== plan.app.id || currentApp.status !== 'draft' || currentApp.namespace !== plan.app.namespace) throw new Error('App is no longer the verified draft');
      requestStarted = true;
      const response = await io.write(op.entity, op.id, opts.tenant) as JsonRecord | undefined;
      if (!response || response.success !== true) throw new Error('Server did not confirm deletion');
      results.push({ ...op, success: true, outcome: 'server_confirmed' });
      receipt({ ...base, success: false, outcome: 'in_progress', results, remaining: plan.operations.slice(results.length) });
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string; requestId?: string };
      const state = !requestStarted ? 'not_sent' : e.statusCode && e.statusCode < 500 ? 'rejected' : 'unknown';
      const result = { ...base, success: false, outcome: 'stopped', results, failed: { ...op, error: e.message, code: e.code, requestId: e.requestId, status: e.statusCode, state }, remaining: plan.operations.slice(results.length + 1), writeAttempted: requestStarted, writesPerformed: results.length > 0 ? true : state === 'unknown' ? null : false, help: 'Inspect the receipt and remote state; do not automatically replay or claim full cleanup.' };
      receipt(result); return result;
    }
  }
  // A failed read is not proof of absence. Native cascaded IDs are verified through successful collections.
  try {
    const appRows = await allDeleteRows(io, 'fm__application', ['id'], { id: eq(plan.app.id) }, opts.tenant);
    if (appRows.length) throw new Error('App still visible after deletion');
    for (const cascade of plan.cascades) for (let i = 0; i < cascade.ids.length; i += 100) {
      if ((await allDeleteRows(io, cascade.entity, ['id'], { id: inside(cascade.ids.slice(i, i + 100)) }, opts.tenant)).length) throw new Error(`Native cascade records remain: ${cascade.entity}`);
    }
    for (const resource of plan.resources.filter(r => r.entity !== 'fm__application')) {
      if ((await allDeleteRows(io, resource.entity, ['id'], { id: eq(resource.id) }, opts.tenant)).length) throw new Error(`Resource remains: ${key(resource.entity, resource.id)}`);
      if (resource.entity === 'fm__object') {
        if ((await allDeleteRows(io, 'fm__object', ['id'], { api_name: eq(resource.apiName) }, opts.tenant)).length) throw new Error(`Object name remains reserved: ${resource.apiName}`);
        if ((await allDeleteRows(io, 'fm__sharing_profile_object', ['id'], { object_api_name: eq(resource.apiName) }, opts.tenant)).length) throw new Error(`Name binding remains: ${resource.apiName}`);
      }
    }
    for (const preserved of plan.preserved) if ((await io.record(preserved.entity, preserved.id, opts.tenant)).id !== preserved.id) throw new Error(`Preserved resource could not be verified: ${preserved.id}`);
    for (const preserved of plan.preservedData) {
      const rows = await allDeleteRows(io, preserved.object, ['id'], {}, opts.tenant);
      if (idsDigest(rows) !== preserved.idsDigest) throw new Error(`Preserved data identities changed: ${preserved.object}`);
    }
    const result = { ...base, success: true, outcome: 'verified', results, writesPerformed: true, verificationScope: 'visible-resource-and-name-bindings', physicalTableAbsenceVerified: false, help: 'Public reads verify visible metadata and name bindings; physical catalog absence is not exposed by the existing API.' };
    receipt(result); return result;
  } catch (err) {
    const result = { ...base, success: false, outcome: 'verification_failed', results, writesPerformed: true, error: (err as Error).message }; receipt(result); return result;
  }
}
