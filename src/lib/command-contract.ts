import { Command, InvalidArgumentError } from 'commander';
import { z } from 'zod';
import { apiRequest } from './api-client';
import { objectPayload, payloadOptions, tenantOption, type JsonRecord, type PayloadOptions } from './command-options';
import { compact, detail, mutationResult } from './platform-output';
import { print } from './output';
export interface Contract { method: string; endpoint: string; effects: string[]; inputSchema?: unknown; serverAuthoritative: true; validation: string }
const contracts = new WeakMap<Command, Contract>();
export function declareContract(command: Command, contract: Contract): void { contracts.set(command, contract); }
const inputSchemas = new WeakMap<Command, z.ZodType>();
export function commandContract(command: Command): Contract | undefined {
  const contract = contracts.get(command); const schema = inputSchemas.get(command);
  if (contract && schema && !contract.inputSchema) contract.inputSchema = z.toJSONSchema(schema);
  return contract;
}
export function parsedBody(schema: z.ZodType, body: unknown): JsonRecord {
  const result = schema.safeParse(body);
  if (!result.success) throw new InvalidArgumentError(result.error.issues.map(i => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; '));
  return result.data as JsonRecord;
}
export function domainResult(result: JsonRecord | undefined, full?: boolean, fullHelp = 'Use the same command with --full'): void {
  if (result?.success === false || result?.status === 'error') { mutationResult({ ...result, success: false }); return; }
  if (result?.held === true) { const rendered = compact(result, full); print({ ...(rendered.data as JsonRecord), outcome: 'held', completed: false, ...(rendered.truncated ? { truncated: true } : {}), help: 'The platform requires a policy decision. Inspect fmx policy pending; a held change has not been applied.' }); return; }
  detail(result ?? { ok: true }, full, fullHelp);
}
export function mutation(parent: Command, config: {
  command: string; description: string; method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; endpoint: string;
  schema?: z.ZodType; buildBody?: (args: string[], body: JsonRecord, opts: PayloadOptions) => JsonRecord;
  effects?: string[]; transformResult?: (result: JsonRecord, body: JsonRecord | undefined) => JsonRecord;
}): Command {
  const command = parent.command(config.command).description(config.description);
  if (config.schema) payloadOptions(command); else tenantOption(command);
  command.option('--full', 'Complete response text');
  contracts.set(command, { method: config.method, endpoint: config.endpoint, effects: config.effects ?? ['write'], serverAuthoritative: true, validation: 'JSON Schema describes structure. Additional semantic checks run in the CLI and platform.' });
  if (config.schema) inputSchemas.set(command, config.schema);
  command.addHelpText('after', '\nUse --dry-run to preview the request. Input contract: fmx catalog <command path>.');
  command.action(async (...values: unknown[]) => {
    const opts = values.at(-2) as PayloadOptions;
    const args = values.slice(0, -2) as string[];
    const parts = [...config.endpoint.matchAll(/:([a-zA-Z]+)/g)];
    let endpoint = config.endpoint;
    for (const [index, part] of parts.entries()) endpoint = endpoint.replace(part[0], encodeURIComponent(args[index]));
    const parsed = config.schema ? parsedBody(config.schema, objectPayload(opts)) : undefined;
    const body = config.buildBody ? config.buildBody(args, parsed ?? {}, opts) : parsed;
    const result = await apiRequest<JsonRecord>({ method: config.method, path: endpoint, body, tenant: opts.tenant });
    domainResult(config.transformResult && result ? config.transformResult(result, body) : result, opts.full);
  });
  return command;
}
