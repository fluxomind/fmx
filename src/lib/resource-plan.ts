import { remoteIdentity } from './remote-identity';
import { mapLimited } from './concurrency';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { InvalidArgumentError } from 'commander';
import { getRecord, listRecords, createRecord, updateRecord } from './record-service';
import { get, resolveTargetTenant } from './api-client';
import { resolveApiUrl } from './config-manager';
import { type JsonRecord } from './command-options';
const text = z.string().trim().min(1);
const map = z.record(text, z.unknown());
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const reserved = new Set(['id', 'tenant_id', 'tenantId', 'created_by_id', 'createdById', 'modified_by_id', 'modifiedById', 'created_at', 'modified_at', '_capabilities', '__proto__', 'constructor', 'prototype']);
const resourceSchema = z.strictObject({ key: text, object: text, id: text.optional(), match: z.record(text, scalar).optional(), data: map });
export const resourceManifestSchema = z.strictObject({ apiVersion: z.literal('fmx/v1'), apiOrigin: z.url(), tenant: z.uuid(), resources: z.array(resourceSchema).min(1).max(100) });
export type ResourceManifest = z.infer<typeof resourceManifestSchema>;
const operationSchema = z.strictObject({ key: text, object: text, action: z.enum(['create', 'update', 'noop']), id: text.optional(), match: z.record(text, scalar).optional(), payload: map, expectedValues: map.optional(), changedFields: z.array(text) });
export const resourcePlanSchema = z.strictObject({ apiVersion: z.literal('fmx/plan-v1'), apiOrigin: z.url(), tenant: z.uuid(), manifestDigest: text, createdAt: z.string(), scope: z.literal('dataengine-managed-fields'), operations: z.array(operationSchema).min(1).max(100), warnings: z.array(z.string()) });
export type ResourcePlan = z.infer<typeof resourcePlanSchema>;
function fail(message: string): never { throw new InvalidArgumentError(message); }
function safeFields(data: JsonRecord): void {
  const keys = Object.keys(data);
  if (!keys.length || keys.some(k => reserved.has(k))) fail('Managed fields must be nonempty and cannot include identity, tenant, audit or prototype properties');
  // Manifests are portable files: credentials belong in connection-specific input, not plans.
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (/token|secret|password|credential|api[_-]?key|authorization/i.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail(`Sensitive or unsafe plan property: ${key}`);
      visit(child);
    }
  }
  visit(data);
}
export function parseManifest(input: unknown): ResourceManifest {
  const parsed = resourceManifestSchema.safeParse(input);
  if (!parsed.success) fail(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  const keys = new Set<string>(); const targets = new Set<string>();
  for (const resource of parsed.data.resources) {
    if (keys.has(resource.key)) fail(`Duplicate resource key: ${resource.key}`); keys.add(resource.key);
    if (Boolean(resource.id) === Boolean(resource.match)) fail(`${resource.key}: provide exactly one of id or match`);
    if (resource.match && (!Object.keys(resource.match).length || Object.keys(resource.match).some(k => reserved.has(k)))) fail(`${resource.key}: match must contain nonempty safe scalar fields`);
    safeFields(resource.data);
    if (resource.match) for (const [key, value] of Object.entries(resource.match)) if (Object.hasOwn(resource.data, key) && !isDeepStrictEqual(resource.data[key], value)) fail(`${resource.key}: managed identity must equal match.${key}`);
    const target = resource.object + ':' + (resource.id ?? stable(resource.match));
    if (targets.has(target)) fail('Multiple resources cannot manage the same target'); targets.add(target);
  }
  return parsed.data;
}
function stable(value: unknown): string {
  function sort(v: unknown): unknown { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort((v as JsonRecord)[k])])) : v; }
  return JSON.stringify(sort(value));
}
export function assertPlanTarget(target: { apiOrigin: string; tenant: string }, explicitTenant?: string): void {
  const declared = new URL(target.apiOrigin);
  if (declared.pathname !== '/' || declared.search || declared.hash || declared.username || declared.password) fail('apiOrigin must be an origin without path, query or credentials');
  if (declared.origin !== new URL(resolveApiUrl()).origin) fail('Plan API origin differs from the active API. Refusing to use credentials for a different target.');
  if (explicitTenant && explicitTenant !== target.tenant) fail('--tenant differs from the manifest/plan tenant');
  const token = process.env.FLUXOMIND_ACCESS_TOKEN;
  if (token) {
    // This is a routing consistency check, not JWT verification; the server verifies every call.
    let claim: unknown;
    try { claim = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).tenantId; } catch { /* Opaque sessions are checked remotely before planning or writing. */ }
    if (claim !== undefined && String(claim) !== target.tenant) fail('Environment token tenant differs from the manifest/plan tenant');
  } else { const active = resolveTargetTenant(explicitTenant); if (active && active !== target.tenant) fail('Active project/session tenant differs from the manifest/plan; select --tenant explicitly if this target is intentional'); }
}
async function matched(object: string, match: Record<string, unknown>, tenant: string): Promise<JsonRecord | undefined> {
  const page = await listRecords(object, { tenant, limit: 1, offset: 0, filters: JSON.stringify(Object.fromEntries(Object.entries(match).map(([k, value]) => [k, { operator: 'eq', value }]))) });
  if (!page.success) throw new Error(page.error ?? 'Match lookup failed');
  if (page.data.length > 1 || page.data.length === 1 && page.rowLimit?.applied === 1 && !page.rowLimit.exact) fail('Match is ambiguous or capped; provide a unique record ID');
  return page.data[0];
}
export async function buildResourcePlan(manifest: ResourceManifest, explicitTenant?: string): Promise<ResourcePlan> {
  assertPlanTarget(manifest, explicitTenant);
  if (process.env.FLUXOMIND_ACCESS_TOKEN) await remoteIdentity(manifest.tenant);
  const operations: ResourcePlan['operations'] = []; const schemas = new Map<string, string[]>(); const identities = new Set<string>();
  await mapLimited([...new Set(manifest.resources.map(resource => resource.object))], 4, async object => {
    const metadata = await get<{ fields: { apiName: string }[] }>(`/api/v1/metadata/objects/${encodeURIComponent(object)}/fields`, manifest.tenant);
    if (!Array.isArray(metadata.fields)) throw new Error('Invalid metadata response');
    if (metadata.fields.length >= 200) fail('Field catalog reached its source limit; cannot safely validate a declarative payload');
    schemas.set(object, metadata.fields.map(f => f.apiName));
  });
  for (const resource of manifest.resources) {
    const allowed = schemas.get(resource.object)!;
    const unknown = Object.keys({ ...resource.match, ...resource.data }).filter(k => !allowed.includes(k));
    if (unknown.length) fail(`${resource.key}: unknown fields: ${unknown.join(', ')}`);
  }
  const observed = await mapLimited(manifest.resources, 4, async resource => resource.id ? await getRecord(resource.object, resource.id, manifest.tenant) : await matched(resource.object, resource.match!, manifest.tenant));
  for (const [index, resource] of manifest.resources.entries()) {
    const current = observed[index];
    if (!current) {
      operations.push({ key: resource.key, object: resource.object, action: 'create', match: resource.match, payload: { ...resource.match, ...resource.data }, changedFields: Object.keys({ ...resource.match, ...resource.data }) }); continue;
    }
    if (current.success === false || typeof current.id !== 'string' || !current.id) throw new Error('Platform did not return a valid record identity');
    const identity = resource.object + ':' + current.id;
    if (identities.has(identity)) fail('Two resources resolve to the same record'); identities.add(identity);
    const managed = Object.keys(resource.data);
    const expected = Object.keys({ ...resource.match, ...resource.data });
    if (expected.some(k => !Object.hasOwn(current, k))) fail(`${resource.key}: readable baseline is missing managed fields; no changes planned`);
    const changed = managed.filter(k => !isDeepStrictEqual(current[k], resource.data[k]));
    operations.push({ key: resource.key, object: resource.object, id: current.id, ...(resource.match ? { match: resource.match } : {}), action: changed.length ? 'update' : 'noop', payload: resource.data, expectedValues: Object.fromEntries(expected.map(k => [k, current[k]])), changedFields: changed });
  }
  return { apiVersion: 'fmx/plan-v1', apiOrigin: manifest.apiOrigin, tenant: manifest.tenant, manifestDigest: createHash('sha256').update(stable(manifest)).digest('hex'), createdAt: new Date().toISOString(), scope: 'dataengine-managed-fields', operations,
    warnings: ['Creates use a preflight lookup, not an atomic uniqueness guarantee.', 'Updates use server expectedValues; operations are sequential, not one transaction.', 'Plans manage record fields only. They do not compose app membership or bypass domain services.'] };
}
export function parsePlan(input: unknown): ResourcePlan {
  const parsed = resourcePlanSchema.safeParse(input);
  if (!parsed.success) fail(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  const keys = new Set<string>(); const ids = new Set<string>();
  for (const op of parsed.data.operations) {
    if (keys.has(op.key)) fail('Duplicate plan key'); keys.add(op.key); safeFields(op.payload);
    if (op.match) safeFields(op.match);
    if (op.expectedValues) safeFields(op.expectedValues);
    if (op.action === 'create' && (!op.match || op.id || op.expectedValues)) fail('Create plans require match and must not carry ID/baseline');
    if (op.action === 'create' && !isDeepStrictEqual(Object.keys(op.payload).sort(), [...op.changedFields].sort())) fail('Create changedFields must describe every payload field');
    if (op.action !== 'create' && (!op.id || !op.expectedValues || Object.keys(op.payload).some(k => !Object.hasOwn(op.expectedValues!, k)))) fail('Update/noop plans require ID and a complete baseline');
    if (op.action !== 'create') {
      const changed = Object.keys(op.payload).filter(k => !isDeepStrictEqual(op.payload[k], op.expectedValues![k]));
      if (op.action === 'noop' && changed.length || op.action === 'update' && !changed.length || !isDeepStrictEqual([...changed].sort(), [...op.changedFields].sort())) fail('Plan action/changedFields disagree with payload and baseline');
    }
    if (op.id) { const id = op.object + ':' + op.id; if (ids.has(id)) fail('Duplicate record target in plan'); ids.add(id); }
    if (op.match && Object.entries(op.match).some(([k, v]) => op.action === 'create' && !isDeepStrictEqual(op.payload[k], v))) fail('Create payload must preserve match identity');
  }
  return parsed.data;
}
export function summarizePlan(plan: ResourcePlan): JsonRecord {
  return { apiVersion: plan.apiVersion, scope: plan.scope, tenant: plan.tenant, apiOrigin: plan.apiOrigin, manifestDigest: plan.manifestDigest,
    count: plan.operations.length, changes: plan.operations.map(({ key, object, action, id, changedFields }) => ({ key, object, action, id: id ?? null, changedFields })), warnings: plan.warnings };
}
export async function applyResourcePlan(plan: ResourcePlan, explicitTenant?: string): Promise<JsonRecord> {
  assertPlanTarget(plan, explicitTenant);
  if (plan.operations.some(op => /^fm_/.test(op.object) && op.action !== 'noop')) fail('Declarative writes to platform system objects require their domain commands; use resources for customer records');
  if (process.env.FLUXOMIND_ACCESS_TOKEN) await remoteIdentity(plan.tenant);
  // Complete read-only preflight before the first write. No changes on a stale initial plan.
  await mapLimited(plan.operations, 4, async op => {
    if (op.action === 'create') { if (await matched(op.object, op.match!, plan.tenant)) fail(`${op.key}: target now exists; regenerate the plan`); }
    else {
      const current = await getRecord(op.object, op.id!, plan.tenant);
      if (Object.entries(op.expectedValues!).some(([k, v]) => !Object.hasOwn(current, k) || !isDeepStrictEqual(current[k], v))) fail(`${op.key}: plan baseline changed; regenerate the plan`);
    }
  });
  const results: JsonRecord[] = [];
  for (const op of plan.operations) {
    if (op.action === 'noop') { results.push({ key: op.key, action: 'noop', id: op.id, success: true }); continue; }
    try {
      const result = op.action === 'create' ? await createRecord(op.object, op.payload, plan.tenant) : await updateRecord(op.object, op.id!, op.payload, plan.tenant, op.expectedValues);
      if (result?.success === false) throw new Error(typeof result.error === 'string' ? result.error : 'Platform rejected the change');
      if (!result || typeof result.id !== 'string' || !result.id || op.id && result.id !== op.id) {
        throw Object.assign(new Error('Platform did not confirm the written record identity; inspect remote state before another attempt'), { code: 'UNCONFIRMED_WRITE_RESULT' });
      }
      results.push({ key: op.key, action: op.action, id: result.id, success: true });
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; requestId?: string; details?: unknown };
      results.push({ key: op.key, action: op.action, id: op.id ?? null, success: false, error: e.message, code: e.code ?? 'APPLY_FAILED', ...(e.requestId ? { requestId: e.requestId } : {}), ...(e.statusCode ? { status: e.statusCode } : {}), ...(e.details !== undefined ? { details: e.details } : {}), operationState: e.name === 'AuthError' || e.statusCode && e.statusCode < 500 ? 'rejected' : 'unknown' });
      return { success: false, results, remaining: plan.operations.slice(results.length).map(o => o.key), atomic: false, help: 'Inspect remote state and regenerate the plan; do not blindly replay after an unknown outcome.' };
    }
  }
  return { success: true, results, atomic: false };
}
