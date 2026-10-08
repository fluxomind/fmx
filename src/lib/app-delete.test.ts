import { beforeEach, describe, expect, it } from 'vitest';
import { applyAppDeletePlan, allDeleteRows, buildAppDeletePlan, validateDeleteInput, type DeleteIO } from './app-delete';
import { setReadOnly } from './request-policy';
import { setDryRun } from './dry-run';
import type { JsonRecord } from './command-options';

const appId = '00000000-0000-7000-8000-000000000001';
const tenant = '00000000-0000-7000-8000-000000000002';
const ownId = '00000000-0000-7000-8000-000000000003';
const sharedId = '00000000-0000-7000-8000-000000000004';
const wfId = '00000000-0000-7000-8000-000000000005';
const foreignId = '00000000-0000-7000-8000-000000000006';
const opts = { withData: true, expectedTenant: tenant };
let tables: Record<string, JsonRecord[]>;
let writes: string[];
let io: DeleteIO;
function matches(row: JsonRecord, filters: JsonRecord) {
  return Object.entries(filters).every(([field, expression]) => {
    const filter = expression as { operator: string; value: unknown };
    return filter.operator === 'eq' ? row[field] === filter.value : (filter.value as unknown[]).includes(row[field]);
  });
}
beforeEach(() => {
  setReadOnly(false); setDryRun(false); writes = [];
  tables = {
    fm__application: [{ id: appId, name: 'Demo', namespace: 'demo', status: 'draft', tenant_id: tenant }],
    fm__application_member: [
      { id: 'm1', application_id: appId, primitive_kind: 'object', primitive_ref: ownId },
      { id: 'm2', application_id: appId, primitive_kind: 'object', primitive_ref: sharedId },
      { id: 'm3', application_id: foreignId, primitive_kind: 'object', primitive_ref: sharedId },
      { id: 'm4', application_id: appId, primitive_kind: 'process', primitive_ref: wfId },
    ],
    fm__object: [
      { id: ownId, api_name: 'tenant__demo_item', name: 'Item', tenant_id: tenant },
      { id: sharedId, api_name: 'tenant__common_item', name: 'Common', tenant_id: tenant },
      ...['fm__application', 'fm__object', 'fm__workflow_definition', 'fm__field', 'fm__application_member'].map((api_name, i) => ({ id: 'meta' + i, api_name })),
    ],
    fm__field: [{ id: 'relation', object_id: ownId, api_name: 'parent', parent_object_id: ownId, on_delete: 'RESTRICT', relationship_type: 'LOOKUP' }],
    fm__workflow_definition: [{ id: wfId, name: 'Published process', status: 'published' }],
    fm__sharing_profile_object: [{ id: 'binding', object_api_name: 'tenant__demo_item' }],
    fm__schema_evolution_ledger: [], fm__workflow_run: [], fm__queue_schedule: [],
    tenant__demo_item: [{ id: 'data1' }, { id: 'data2' }], tenant__common_item: [{ id: 'shared-data' }],
  };
  io = {
    pendingJobs: async () => [],
    origin: () => 'https://fixture.invalid', identity: async () => ({ tenantId: tenant, userId: 'user' }),
    record: async (entity, id) => {
      const row = tables[entity]?.find(r => r.id === id);
      if (!row) throw Object.assign(new Error('Missing/inaccessible'), { statusCode: 404 });
      return { ...row };
    },
    page: async (entity, fields, filters, offset) => {
      if (!tables[entity]) throw new Error('No schema: ' + entity);
      return { success: true, data: tables[entity].filter(row => matches(row, filters)).slice(offset, offset + 200).map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null]))), rowLimit: { applied: 200 } };
    },
    write: async (entity, id) => {
      writes.push(`${entity}:${id}`);
      const row = tables[entity].find(r => r.id === id)!;
      tables[entity] = tables[entity].filter(r => r.id !== id);
      if (entity === 'fm__object') tables[String(row.api_name)] = [];
      if (entity === 'fm__application') tables.fm__application_member = tables.fm__application_member.filter(r => r.application_id !== id);
      return { success: true };
    },
  };
});

describe('governed full draft deletion', () => {
  it('requires an exact UUID confirmation before remote execution', () => {
    expect(() => validateDeleteInput('bad', opts, 'bad')).toThrow('UUID');
    expect(() => validateDeleteInput(appId, opts)).toThrow('--confirm');
    expect(() => validateDeleteInput(appId, opts, foreignId)).toThrow('--confirm');
    expect(() => validateDeleteInput(appId, opts, undefined, true)).not.toThrow();
  });
  it('inventories load, preserves shared objects, and deletes app last without touching shared data', async () => {
    const plan = await buildAppDeletePlan(appId, opts, io);
    expect(plan.blockers).toEqual([]); expect(plan.executable).toBe(true);
    expect(plan.data).toMatchObject([{ object: 'tenant__demo_item', count: 2, complete: true }]);
    expect(plan.preserved).toMatchObject([{ id: sharedId }]); expect(writes).toEqual([]);
    const receipts: JsonRecord[] = [];
    const result = await applyAppDeletePlan(plan, opts, appId, r => receipts.push(structuredClone(r)), io);
    expect(result.success).toBe(true);
    expect(writes.at(-1)).toBe('fm__application:' + appId);
    expect(writes.slice(0, 2)).toEqual(['fm__field:relation', 'fm__sharing_profile_object:binding']);
    expect(writes).not.toContain('fm__object:' + sharedId);
    expect(tables.tenant__demo_item).toEqual([]); expect(tables.tenant__common_item).toEqual([{ id: 'shared-data' }]);
    expect(receipts[0].outcome).toBe('in_progress'); expect(receipts.at(-1)?.outcome).toBe('verified');
  });
  it('blocks populated objects without explicit data destruction scope', async () => {
    const plan = await buildAppDeletePlan(appId, {}, io);
    expect(plan.blockers.some(b => b.code === 'DATA_CONFIRMATION_REQUIRED')).toBe(true); expect(plan.executable).toBe(false);
  });
  it('blocks published/archived app identities while supporting published exclusive workflows', async () => {
    for (const status of ['published', 'archived']) {
      tables.fm__application[0].status = status;
      const plan = await buildAppDeletePlan(appId, opts, io);
      expect(plan.blockers.some(b => b.code === 'APP_NOT_DRAFT')).toBe(true);
      await expect(applyAppDeletePlan(plan, opts, appId, () => {}, io)).rejects.toThrow('Blocked');
    }
    expect(writes).toEqual([]);
  });
  it('requires the verified tenant and blocks protected metadata', async () => {
    await expect(buildAppDeletePlan(appId, { expectedTenant: foreignId }, io)).rejects.toThrow('tenant');
    tables.fm__object.find(r => r.id === ownId)!.extra_metadata = { core_platform: true };
    expect((await buildAppDeletePlan(appId, opts, io)).blockers.some(b => b.code === 'PROTECTED_OBJECT')).toBe(true);
  });
  it('does not interpret a missing/inaccessible agent as absent', async () => {
    tables.fm__application_member.push({ id: 'agent-member', application_id: appId, primitive_kind: 'agent', primitive_ref: foreignId });
    const plan = await buildAppDeletePlan(appId, opts, io);
    expect(plan.blockers.some(b => b.code === 'RESOURCE_UNVERIFIED' && b.target.includes(foreignId))).toBe(true);
  });
  it('blocks external table relations even when their data collection is empty', async () => {
    tables.fm__field.push({ id: 'external', object_id: sharedId, api_name: 'owned_lookup', parent_object_id: ownId, on_delete: 'CASCADE', relationship_type: 'LOOKUP' });
    expect((await buildAppDeletePlan(appId, opts, io)).blockers.some(b => b.code === 'EXTERNAL_OBJECT_REFERENCE')).toBe(true);
  });
  it('includes only explicitly selected unlinked objects and preserves them if shared', async () => {
    tables.fm__object.push({ id: foreignId, api_name: 'tenant__demo_orphan', tenant_id: tenant }); tables.tenant__demo_orphan = [];
    const plan = await buildAppDeletePlan(appId, { ...opts, includeObjects: [foreignId] }, io);
    expect(plan.resources.some(r => r.id === foreignId && r.source === 'explicit')).toBe(true);
    tables.fm__application_member.push({ id: 'foreign-member', application_id: foreignId, primitive_kind: 'object', primitive_ref: foreignId });
    expect((await buildAppDeletePlan(appId, { ...opts, includeObjects: [foreignId] }, io)).preserved.some(r => r.id === foreignId)).toBe(true);
  });
  it('blocks runtime activity, referencing schedules and lifecycle reservations', async () => {
    tables.fm__workflow_run.push({ id: 'run', workflow_definition_id: wfId, status: 'waiting' });
    tables.fm__queue_schedule.push({ id: 'schedule', status: 'active', job_payload_template: { definitionId: wfId } });
    tables.fm__schema_evolution_ledger.push({ id: 'ledger', element_ref: ownId });
    const plan = await buildAppDeletePlan(appId, opts, io);
    expect(plan.blockers.map(b => b.code)).toEqual(expect.arrayContaining(['ACTIVE_WORKFLOW_RUN', 'REFERENCING_SCHEDULE', 'LIFECYCLE_HISTORY']));
  });
  it('blocks queue activity whose app ownership cannot be verified', async () => {
    io.pendingJobs = async () => [{ id: 'pending-job', status: 'queued' }];
    expect((await buildAppDeletePlan(appId, opts, io)).blockers.some(b => b.code === 'QUEUE_ACTIVITY_UNVERIFIED')).toBe(true);
  });
  it('requires proven object ownership and detects field name reservation history', async () => {
    delete tables.fm__object.find(r => r.id === ownId)!.tenant_id;
    expect((await buildAppDeletePlan(appId, opts, io)).blockers.some(b => b.code === 'OBJECT_OWNER_UNVERIFIED')).toBe(true);
    tables.fm__object.find(r => r.id === ownId)!.tenant_id = tenant;
    tables.fm__schema_evolution_ledger.push({ id: 'field-alias', element_ref: 'relation' });
    expect((await buildAppDeletePlan(appId, opts, io)).blockers.some(b => b.code === 'LIFECYCLE_HISTORY')).toBe(true);
  });
  it('rechecks the whole inventory before the first write', async () => {
    const plan = await buildAppDeletePlan(appId, opts, io);
    tables.tenant__demo_item.push({ id: 'new-data' });
    await expect(applyAppDeletePlan(plan, opts, appId, () => {}, io)).rejects.toThrow('inventory changed'); expect(writes).toEqual([]);
  });
  it('records partial/unknown results, never retries, and leaves the app for inspection', async () => {
    const plan = await buildAppDeletePlan(appId, opts, io); let attempts = 0;
    io.write = async () => { attempts++; throw new Error('timeout'); };
    const result = await applyAppDeletePlan(plan, opts, appId, () => {}, io);
    expect(result.success).toBe(false); expect(result.outcome).toBe('stopped');
    expect((result.failed as JsonRecord).state).toBe('unknown'); expect(attempts).toBe(1);
    expect(result.writesPerformed).toBe(null); expect(result.writeAttempted).toBe(true);
    expect(tables.fm__application).toHaveLength(1);
  });
  it('distinguishes an unsent operation when the draft changes after the fresh preflight', async () => {
    const plan = await buildAppDeletePlan(appId, opts, io);
    const result = await applyAppDeletePlan(plan, opts, appId, () => { tables.fm__application[0].status = 'published'; }, io);
    expect((result.failed as JsonRecord).state).toBe('not_sent'); expect(result.writesPerformed).toBe(false); expect(writes).toEqual([]);
  });
  it('does not send a write when receipt storage fails or read-only is enabled', async () => {
    const plan = await buildAppDeletePlan(appId, opts, io);
    await expect(applyAppDeletePlan(plan, opts, appId, () => { throw Error('disk full'); }, io)).rejects.toThrow('disk full');
    setReadOnly(true); await expect(applyAppDeletePlan(plan, opts, appId, () => {}, io)).rejects.toThrow('GET'); expect(writes).toEqual([]);
  });
  it('does not call a verification failure successful cleanup', async () => {
    const plan = await buildAppDeletePlan(appId, opts, io); const remove = io.write;
    io.write = async (entity, id) => { const r = await remove(entity, id); if (entity === 'fm__application') io.page = async () => { throw Error('denied'); }; return r; };
    const result = await applyAppDeletePlan(plan, opts, appId, () => {}, io);
    expect(result.success).toBe(false); expect(result.outcome).toBe('verification_failed');
  });
  it('does not follow unowned cascades or detach restricted dependents', async () => {
    tables.fm__field.push({ id: 'app-edge', object_id: 'meta4', api_name: 'application_id', parent_object_id: 'meta0', on_delete: 'RESTRICT', relationship_type: 'LOOKUP' });
    expect((await buildAppDeletePlan(appId, opts, io)).blockers.some(b => b.code === 'REFERENTIAL_DEPENDENCY')).toBe(true);
    tables.fm__field.at(-1)!.on_delete = 'CASCADE';
    expect((await buildAppDeletePlan(appId, opts, io)).blockers).toEqual([]); // known application ownership edge
  });
});

describe('complete visible pagination', () => {
  it('continues across a server cap and does not trust totalRecords as a total', async () => {
    const pages: number[] = [];
    io.page = async (_entity, _fields, _filters, offset) => { pages.push(offset); return { success: true, totalRecords: 2, rowLimit: { applied: 2 }, data: [{ id: '1' }, { id: '2' }, { id: '3' }].slice(offset, offset + 2) }; };
    expect(await allDeleteRows(io, 'rows', ['id'], {})).toHaveLength(3); expect(pages).toEqual([0, 2]);
  });
  it('fails closed on repeating pagination or missing requested fields', async () => {
    io.page = async () => ({ success: true, rowLimit: { applied: 1 }, data: [{ id: 'same' }] });
    await expect(allDeleteRows(io, 'rows', ['id'], {})).rejects.toThrow('repeated');
    io.page = async () => ({ success: true, data: [{ id: 'same' }] });
    await expect(allDeleteRows(io, 'rows', ['id', 'missing'], {})).rejects.toThrow('Unreadable');
  });
});
