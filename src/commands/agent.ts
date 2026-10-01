import { Command, InvalidArgumentError } from 'commander';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiRequest, get, post } from '../lib/api-client';
import { createRecord, deleteRecord, getRecord, listRecords, updateRecord } from '../lib/record-service';
import { listOptions, objectOption, objectPayload, pathPart, payloadOptions, tenantOption, type JsonRecord, type ListOptions, type PayloadOptions } from '../lib/command-options';
import { detail, mutationResult } from '../lib/platform-output';
import { pageResult } from './records';
import { print } from '../lib/output';
export const agentCommand = new Command('agent').description('Platform agents: CRUD, portable configuration and execution');
listOptions(agentCommand.command('list').description('List tenant agents'))
  .action(async (opts: ListOptions) => pageResult('fm__agent', await listRecords('fm__agent', opts, ['id', 'name', 'is_active']), opts));
tenantOption(agentCommand.command('get <id>').description('Read an agent configuration'))
  .option('--full', 'Complete prompt and text').action(async (id: string, opts: PayloadOptions) => detail(await getRecord('fm__agent', id, opts.tenant), opts.full, `fmx agent get ${id} --full`));
payloadOptions(agentCommand.command('create').description('Create an agent; payload requires name'))
  .action(async (opts: PayloadOptions) => {
    const body = objectPayload(opts); if (typeof body.name !== 'string' || !body.name.trim()) throw new InvalidArgumentError('Agent creation requires a nonempty name');
    mutationResult(await createRecord('fm__agent', body, opts.tenant));
  });
payloadOptions(agentCommand.command('update <id>').description('Update an agent; optionally enforce a baseline'))
  .option('--expected <json>', 'Expected field values')
  .action(async (id: string, opts: PayloadOptions & { expected?: string }) => {
    const body = objectPayload(opts); const expected = objectOption(opts.expected, '--expected');
    mutationResult(await updateRecord('fm__agent', id, body, opts.tenant, expected));
  });
tenantOption(agentCommand.command('delete <id>').description('Delete an agent'))
  .action(async (id: string, opts: PayloadOptions) => mutationResult(await deleteRecord('fm__agent', id, opts.tenant)));
tenantOption(agentCommand.command('export <id>').description('Export platform portable configuration; --out writes lossless JSON'))
  .option('--out <path>', 'Create a JSON file; refuses to overwrite an existing file')
  .action(async (id: string, opts: PayloadOptions & { out?: string }) => {
    const result = await post('/api/v1/agentConfig/export', { agentId: id }, opts.tenant);
    if (opts.out) {
      writeFileSync(opts.out, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      print({ ok: true, path: resolve(opts.out) });
    } else print(result);
  });
payloadOptions(agentCommand.command('import').description('Import portable configuration using create, update or merge'))
  .requiredOption('--mode <mode>', 'Import mode: create, update, merge')
  .option('--name <name>', 'Override imported agent name')
  .option('--skip-existing-knowledge', 'Skip knowledge already linked to the agent')
  .action(async (opts: PayloadOptions & { mode: string; name?: string; skipExistingKnowledge?: boolean }) => {
    if (!['create', 'update', 'merge'].includes(opts.mode)) throw new InvalidArgumentError('--mode must be create, update or merge');
    const data = objectPayload(opts);
    if (typeof data.version !== 'string' || !data.agent || typeof data.agent !== 'object' || Array.isArray(data.agent)) throw new InvalidArgumentError('Import requires a portable export with version and agent fields');
    mutationResult(await post('/api/v1/agentConfig/import', { data, options: { mode: opts.mode, ...(opts.name ? { newAgentName: opts.name } : {}), ...(opts.skipExistingKnowledge ? { skipExistingKnowledge: true } : {}) } }, opts.tenant));
  });
payloadOptions(agentCommand.command('invoke <id>').description('Execute an agent synchronously; JSON requires messages'))
  .action(async (id: string, opts: PayloadOptions) => {
    const body = objectPayload(opts);
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.some(message => !message || !['user', 'assistant', 'system'].includes(message.role) || typeof message.content !== 'string')) throw new InvalidArgumentError('messages must be a nonempty array of {role:user|assistant|system,content:string}');
    mutationResult(await post(`/api/agents/${pathPart(id)}/runs/invoke`, body, opts.tenant));
  });
agentCommand.addHelpText('after', '\nExamples:\n  fmx agent list\n  fmx agent export <id> --out agent.json\n  fmx agent import --file agent.json --mode create --name "<name>"');

const models = agentCommand.command('models').description('Discover model slots and configure assignments through the agent API');
tenantOption(models.command('list <id>').description('Read current assignments and available models; --full includes compatibility metadata'))
  .option('--full', 'Include available-model and slot metadata')
  .action(async (id: string, opts: PayloadOptions) => {
    const result = await get<JsonRecord>(`/api/agent-studio/agents/${pathPart(id)}/models`, opts.tenant);
    if (opts.full) print(result); else print({ assignments: result.assignments, profileAssignments: result.profileAssignments, slots: Array.isArray(result.slots) ? result.slots.map((s: JsonRecord) => ({ key: s.key, label: s.label, role: s.role })) : [], help: `fmx agent models list ${id} --full` });
  });
payloadOptions(models.command('assign <id>').description('Assign a model; payload requires assignment.modelCatalogId and role or slotKey'))
  .action(async (id: string, opts: PayloadOptions) => {
    const body = objectPayload(opts); const assignment = body.assignment as JsonRecord | undefined;
    if (!assignment || typeof assignment.modelCatalogId !== 'string' || !assignment.modelCatalogId.trim() || !(typeof assignment.role === 'string' && assignment.role.trim() || typeof assignment.slotKey === 'string' && assignment.slotKey.trim())) throw new InvalidArgumentError('Provide assignment with nonempty modelCatalogId and role or slotKey');
    if (Object.keys(body).some(k => k !== 'assignment')) throw new InvalidArgumentError('Model assign accepts only assignment; profile removal is a separate platform operation');
    mutationResult(await apiRequest({ method: 'PUT', path: `/api/agent-studio/agents/${pathPart(id)}/models`, body, tenant: opts.tenant }));
  });
const knowledge = agentCommand.command('knowledge').description('Discover and link knowledge bases through the agent API');
tenantOption(knowledge.command('list <id>').description('Read linked knowledge bases'))
  .action(async (id: string, opts: PayloadOptions) => {
    const result = await get<{ data: JsonRecord[] }>(`/api/agent-studio/agents/${pathPart(id)}/knowledge`, opts.tenant);
    print({ count: result.data.length, total: null, knowledge: result.data.map(k => ({ junctionId: k.junctionId, knowledgeId: k.knowledgeId, name: (k.knowledge as JsonRecord | null)?.name })), help: `fmx agent knowledge link ${id} --file <links.json>` });
  });
payloadOptions(knowledge.command('link <id>').description('Associate existing knowledge bases; payload requires knowledgeIds array'))
  .action(async (id: string, opts: PayloadOptions) => {
    const body = objectPayload(opts);
    if (!Array.isArray(body.knowledgeIds) || !body.knowledgeIds.length || body.knowledgeIds.some(value => typeof value !== 'string' || !value.trim()) || Object.keys(body).some(k => k !== 'knowledgeIds')) throw new InvalidArgumentError('Provide only knowledgeIds, a nonempty string array');
    mutationResult(await post(`/api/agent-studio/agents/${pathPart(id)}/knowledge`, body, opts.tenant));
  });
