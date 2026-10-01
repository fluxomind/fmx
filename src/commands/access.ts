import { Command } from 'commander';
import { tenantOption, type PayloadOptions } from '../lib/command-options';
import { getRecord, listRecords } from '../lib/record-service';
import { print } from '../lib/output';
export const accessCommand = new Command('access').description('Inspect server-provided record capabilities; never infer write permission from a successful read');
tenantOption(accessCommand.command('record <object> <id>').description('Read the capability snapshot for a specific record')).action(async (object: string, id: string, opts: PayloadOptions) => {
  const record = await getRecord(object, id, opts.tenant);
  if (record.success === false || String(record.id) !== id) throw new Error('Platform did not return the requested readable record');
  const capabilities = record._capabilities && typeof record._capabilities === 'object' ? (record._capabilities as Record<string, unknown>)[id] ?? null : null;
  print({ object, id, readable: true, capabilities, source: 'server', scope: 'record-snapshot', warning: 'Capabilities can change; the server checks authorization again when executing.' });
});
tenantOption(accessCommand.command('object <object>').description('Probe object readability and capabilities of one visible record; no mutation')).action(async (object: string, opts: PayloadOptions) => {
  const page = await listRecords(object, { tenant: opts.tenant, limit: 1, offset: 0 }, ['id']);
  if (!page.success) throw new Error(page.error ?? 'Object read refused');
  const sample = page.data[0];
  const caps = sample && page.capabilities && typeof page.capabilities === 'object' ? (page.capabilities as Record<string, unknown>)[String(sample.id)] ?? null : null;
  print({ object, readable: true, sampleId: sample?.id ?? null, capabilities: caps, source: 'server', scope: 'visible-record-sample', createPermission: 'unknown', warning: 'A sample or an empty result is not proof of object-wide write permission.' });
});
