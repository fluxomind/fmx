import { describe, expect, it } from 'vitest';
import { validateWorkflow } from './workflow-validation';
export const fixture = {
  id: 'demo', name: 'Demo', type: 'custom', version: 1, triggers: [],
  nodes: [{ id: 'entry', type: 'trigger', trigger_type: 'webhook', config: {} }, { id: 'code', type: 'custom_code', config: { code: 'return input;' }, input_mapping: { payload: '{{entry.output.request}}' } }],
  edges: [{ source: 'entry', target: 'code' }],
};
describe('Offline workflow preflight', () => {
  it('accepts canonical definitions and create payloads without running user code', () => {
    expect(validateWorkflow(fixture).valid).toBe(true);
    expect(validateWorkflow({ definition: { ...fixture, edges: [], nodes: [{ ...fixture.nodes[1], config: { code: 'throw new Error("must not execute")' }, input_mapping: {} }] }, name: 'Demo' }).valid).toBe(true);
  });
  it('rejects dangling edges, absent trigger type, and duplicate identifiers', () => {
    const result = validateWorkflow({ ...fixture, nodes: [{ id: 'same', type: 'trigger', config: {} }, { id: 'same', type: 'action', config: {} }] });
    expect(result.valid).toBe(false);
    expect(result.errors.map(e => e.path)).toEqual(expect.arrayContaining(['nodes.0.trigger_type', 'nodes.1.id', 'nodes.1.action', 'edges.0.source']));
  });
  it('rejects invalid mappings and code without source', () => {
    const result = validateWorkflow({ ...fixture, nodes: [{ id: 'broken', type: 'custom_code', config: {}, input_mapping: { a: '{{absent.output.a}}', b: 'prefix {{broken.output.b}}' } }] });
    expect(result.errors.map(e => e.path)).toEqual(expect.arrayContaining(['nodes.0.config.code', 'nodes.0.input_mapping.a', 'nodes.0.input_mapping.b']));
  });
});
