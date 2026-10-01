import { z } from 'zod';
import { get } from './api-client';
import { pathPart } from './command-options';
// Portable design-time contract. The server remains authoritative for runtime validation.
const types = ['action', 'trigger', 'branch', 'switch', 'loop', 'wait', 'approval', 'parallel', 'delay', 'subflow', 'resolution', 'screen', 'send', 'custom_code'] as const;
const triggerTypes = ['inbound_message', 'record_change', 'schedule', 'webhook'] as const;
export const definitionSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), type: z.enum(['support', 'campaign', 'onboarding', 'custom']),
  workflow_kind: z.enum(['automation', 'approval', 'journey']).optional(), version: z.number().int().min(0),
  nodes: z.array(z.object({ id: z.string().min(1), type: z.enum(types), action: z.string().optional(), trigger_type: z.enum(triggerTypes).optional(), config: z.record(z.string(), z.unknown()), input_mapping: z.record(z.string(), z.string()).optional() })).min(1),
  edges: z.array(z.object({ source: z.string().min(1), target: z.string().min(1), label: z.string().optional() })),
  triggers: z.array(z.object({ id: z.string().min(1), type: z.enum(triggerTypes), config: z.record(z.string(), z.unknown()) })),
});
export interface Issue { path: string; message: string }
export function unwrapDefinition(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'definition' in value) return (value as { definition: unknown }).definition;
  return value;
}
export function validateWorkflow(value: unknown): { valid: boolean; scope: string; errors: Issue[]; warnings: string[] } {
  const parsed = definitionSchema.safeParse(unwrapDefinition(value));
  const errors: Issue[] = [];
  if (!parsed.success) return { valid: false, scope: 'local-structure', errors: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })), warnings: [] };
  const d = parsed.data; const ids = new Set(d.nodes.map(n => n.id)); const seen = new Set<string>();
  d.nodes.forEach((n, i) => {
    const issue = (field: string, message: string) => errors.push({ path: `nodes.${i}.${field}`, message });
    if (seen.has(n.id)) issue('id', `Duplicate node id: ${n.id}`); seen.add(n.id);
    if (n.type === 'action' && !n.action?.trim()) issue('action', 'Action node requires an action name');
    if (n.type === 'trigger' && !n.trigger_type) issue('trigger_type', 'Trigger node requires trigger_type');
    if (n.type === 'custom_code' && (typeof n.config.code !== 'string' || !n.config.code.trim())) issue('config.code', 'Code node requires source code');
    if (n.type === 'branch' && (typeof n.config.condition !== 'string' || !n.config.condition.trim())) issue('config.condition', 'Branch requires a condition');
    for (const [key, template] of Object.entries(n.input_mapping ?? {})) {
      if (template.includes('{{') && !/^\{\{(.+?)\.output\.(.+)\}\}$/.test(template)) issue(`input_mapping.${key}`, 'Use a whole-value mapping: {{node-id.output.path}}');
      const match = template.match(/^\{\{(.+?)\.output\.(.+)\}\}$/);
      if (match && !ids.has(match[1])) issue(`input_mapping.${key}`, `Unknown source node: ${match[1]}`);
      if (match?.[1] === n.id) issue(`input_mapping.${key}`, 'A node cannot read its own output');
    }
  });
  d.edges.forEach((e, i) => { for (const field of ['source', 'target'] as const) if (!ids.has(e[field])) errors.push({ path: `edges.${i}.${field}`, message: `Unknown node: ${e[field]}` }); });
  const warnings = ['Local validation does not execute code, resolve permissions, or verify action contracts. Publishing and execution are validated by the platform.'];
  return { valid: errors.length === 0, scope: 'local-structure', errors, warnings };
}
export async function validateActionContracts(value: unknown, tenant?: string): Promise<Issue[]> {
  const parsed = definitionSchema.parse(unwrapDefinition(value)); const errors: Issue[] = [];
  const actions = [...new Set(parsed.nodes.filter(n => n.type === 'action').map(n => n.action!))];
  for (const name of actions) {
    const schema = await get<{ inputs: Record<string, { required?: boolean }> }>(`/api/workflow/catalog/${pathPart(name)}/schema`, tenant);
    for (const [i, node] of parsed.nodes.entries()) if (node.action === name) {
      for (const [key, spec] of Object.entries(schema.inputs)) if (spec.required) {
        const value = node.input_mapping?.[key] ?? node.config[key];
        if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) errors.push({ path: `nodes.${i}.config.${key}`, message: `${name} requires ${key}` });
      }
    }
  }
  return errors;
}
