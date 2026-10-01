import { Command, InvalidArgumentError } from 'commander';
import { z } from 'zod';
import { mutation } from '../lib/command-contract';
import { resolveTargetTenant } from '../lib/api-client';
import { getRecord, listRecords } from '../lib/record-service';
import { listOptions, tenantOption, type ListOptions, type PayloadOptions } from '../lib/command-options';
import { pageResult } from './records';
import { print } from '../lib/output';
import { projectRows } from './inspect';
export const knowledgeCommand = new Command('knowledge').description('Inspect existing knowledge and ingest text through the platform retrieval service');
listOptions(knowledgeCommand.command('list').description('Read knowledge identities and index status')).action(async (opts: ListOptions) => pageResult('fm__knowledge', await listRecords('fm__knowledge', opts, ['id', 'name', 'index_status', 'source_type']), opts));
tenantOption(knowledgeCommand.command('status <id>').description('Read the stored index status; does not prove every chunk is indexed')).action(async (id: string, opts: PayloadOptions) => {
  const row = await getRecord('fm__knowledge', id, opts.tenant);
  print({ knowledge: projectRows([row], ['id', 'name', 'index_status', 'source_type']).rows[0], scope: 'stored-status' });
});
mutation(knowledgeCommand, { command: 'ingest <id>', description: 'Ingest text into an existing knowledge base; consumes quota and writes data', method: 'POST', endpoint: '/api/services/retrieval/ingest', effects: ['write', 'consumes-quota'], schema: z.strictObject({ text: z.string().min(1) }), buildBody: (args, body, opts) => {
  const tenant = resolveTargetTenant(opts.tenant);
  if (!tenant || !z.uuid().safeParse(tenant).success) throw new InvalidArgumentError('Knowledge ingestion requires a tenant UUID via --tenant or the project/session context; the server verifies it against the token');
  return { tenantId: tenant, knowledgeId: args[0], text: body.text };
} });
