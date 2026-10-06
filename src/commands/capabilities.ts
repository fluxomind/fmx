import { remoteIdentity } from '../lib/remote-identity';
import { Command, InvalidArgumentError } from 'commander';
import { z } from 'zod';
import { openAsBlob, statSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { apiRequest, get } from '../lib/api-client';
import { mutation, declareContract, parsedBody } from '../lib/command-contract';
import { tenantOption, payloadOptions, objectPayload, type PayloadOptions } from '../lib/command-options';
import { print } from '../lib/output';
import { isDryRun } from '../lib/dry-run';
import { isReadOnly, ReadOnlyError } from '../lib/request-policy';
import { modelCommand } from './platform';
import { authCommand } from './auth';
const text = z.string().trim().min(1);

export const tenantCommand = new Command('tenant').description('Read authenticated tenant identity and quota');
tenantOption(tenantCommand.command('identity').description('Verify remote identity; never prints tokens or cookies')).action(async opts => print(await remoteIdentity(opts.tenant)));
tenantOption(tenantCommand.command('quota').description('Read tenant quota usage; does not change limits')).action(async opts => print(await get('/api/v1/tenant/quota', opts.tenant)));
tenantOption(authCommand.command('check').description('Verify remote identity and tenant; saved status alone is not proof')).action(async opts => print({ authenticated: true, ...await remoteIdentity(opts.tenant) }));

mutation(modelCommand, { command: 'restore-object <object>', description: 'Restore a soft-retired object within the platform retention window', method: 'POST', endpoint: '/api/services/modelling/objects/:object/restore' });
tenantOption(modelCommand.command('export <objects>').description('Export comma-separated object names; platform source limits apply'))
  .option('--out <path>', 'Save complete JSON with private permissions; refuses overwrite')
  .action(async (objects: string, opts: PayloadOptions & { out?: string }) => {
    if (objects.split(',').some(name => !name.trim())) throw new InvalidArgumentError('Provide nonempty comma-separated object names');
    if (opts.out && existsSync(opts.out)) throw new Error('Export path already exists; choose a new filename');
    const result = await get('/api/services/modelling/export?' + new URLSearchParams({ objects }), opts.tenant);
    if (opts.out) { writeFileSync(opts.out, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); print({ path: opts.out, scope: 'platform-export', completeness: 'not-guaranteed' }); }
    else print({ data: result, scope: 'platform-export', completeness: 'not-guaranteed' });
  });
const importSchema = z.strictObject({ version: z.string().optional(), exportedAt: z.string().optional(), objects: z.array(z.record(z.string(), z.unknown())).min(1) });
const importCommand = payloadOptions(modelCommand.command('import').description('Import object and field metadata; not a full app restore, no atomic rollback'));
declareContract(importCommand, { method: 'POST', endpoint: '/api/services/modelling/import', effects: ['write', 'may-partially-apply'], inputSchema: z.toJSONSchema(importSchema), serverAuthoritative: true, validation: 'Structural input checks only; references remain server-controlled.' });
importCommand.action(async (opts: PayloadOptions) => {
  const body = parsedBody(importSchema, objectPayload(opts));
  const objects = body.objects as Record<string, unknown>[];
  for (const object of objects) {
    if (typeof (object.apiName ?? object.api_name) !== 'string') throw new InvalidArgumentError('Each object requires apiName or api_name');
    if (['indexes', 'triggers', 'validations'].some(key => Array.isArray(object[key]) && (object[key] as unknown[]).length)) throw new InvalidArgumentError('Platform import only restores objects and fields; indexes, triggers and validations would be lost');
  }
  const result = await apiRequest<{ results?: { status: string }[] }>({ method: 'POST', path: '/api/services/modelling/import', body: { objects }, tenant: opts.tenant });
  print(result);
  if ((result as { success?: boolean }).success === false || result.results?.some(item => !['created', 'skipped'].includes(item.status))) process.exitCode = 1;
});

export const filesCommand = new Command('files').description('Upload, inspect and link files through FileEngine; no local credential handling');
tenantOption(filesCommand.command('get <id>').description('Read file identity, shares and links')).action(async (id, opts) => print(await get('/api/services/fileEngine/items?' + new URLSearchParams({ itemType: 'file', itemId: id }), opts.tenant)));
tenantOption(filesCommand.command('for-target <object> <id>').description('List files attached to a visible target record')).action(async (object, id, opts) => print(await get('/api/services/fileEngine/filesForTarget?' + new URLSearchParams({ target_object_api_name: object, target_record_id: id }), opts.tenant)));
const linkSchema = z.strictObject({ file_id: z.uuid(), target_object_api_name: text, target_record_id: z.uuid(), relation_type: text.optional() });
mutation(filesCommand, { command: 'link', description: 'Link a file to a record; knowledge_source is validated by the platform', method: 'POST', endpoint: '/api/services/fileEngine/linkFile', schema: linkSchema, effects: ['write', 'may-trigger-ingestion'] });
mutation(filesCommand, { command: 'unlink', description: 'Remove a file link; does not delete the file', method: 'POST', endpoint: '/api/services/fileEngine/unlinkFile', schema: linkSchema.omit({ relation_type: true }) });
mutation(filesCommand, { command: 'delete <id>', description: 'Delete an unreferenced file; server rejects dependent links', method: 'DELETE', endpoint: '/api/services/fileEngine/items', buildBody: args => ({ itemType: 'file', itemId: args[0] }) });
const upload = tenantOption(filesCommand.command('upload <path>').description('Upload one local file via multipart; maximum 100 MiB')).requiredOption('--mime <type>', 'Explicit MIME type accepted by the platform').option('--folder <id>', 'Destination folder');
declareContract(upload, { method: 'POST', endpoint: '/api/services/fileEngine/upload', effects: ['write', 'uploads-file'], serverAuthoritative: true, validation: 'Local size check; server validates MIME, folder and permissions.' });
upload.action(async (path, opts) => {
  if (isReadOnly() && !isDryRun()) throw new ReadOnlyError();
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) throw new InvalidArgumentError('Upload requires a file of at most 100 MiB');
  if (isDryRun()) { print({ dryRun: true, writesPerformed: false, method: 'POST', path: '/api/services/fileEngine/upload', filename: basename(path), bytes: stat.size, mime: opts.mime, folderId: opts.folder }); return; }
  const form = new FormData(); form.append('file', await openAsBlob(path, { type: opts.mime }), basename(path));
  if (opts.folder) form.append('folderId', opts.folder);
  print(await apiRequest({ method: 'POST', path: '/api/services/fileEngine/upload', body: form, tenant: opts.tenant }));
});
