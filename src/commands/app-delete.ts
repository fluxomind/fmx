import { Command, InvalidArgumentError } from 'commander';
import { openSync, closeSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { tenantOption } from '../lib/command-options';
import { declareContract } from '../lib/command-contract';
import { buildAppDeletePlan, applyAppDeletePlan, validateDeleteInput, type DeleteOptions } from '../lib/app-delete';
import { isDryRun } from '../lib/dry-run';
import { isReadOnly, ReadOnlyError } from '../lib/request-policy';
import { info, print } from '../lib/output';

export function registerAppDelete(apps: Command): void {
  const command = tenantOption(apps.command('delete <id>').description('Delete a draft app and its verified exclusive resources; shared primitives are preserved'))
    .option('--confirm <uuid>', 'Required for execution: repeat the exact app UUID')
    .option('--with-data', 'Explicitly include destruction of data in exclusive objects')
    .option('--include-object <uuid>', 'Also include an explicitly approved object not linked to the app; repeat for each UUID', (value: string, values: string[]) => [...values, value], [])
    .option('--expected-tenant <uuid>', 'Require this verified remote tenant UUID, including for a default OAuth session')
    .option('--remote', 'With --dry-run: inventory the tenant using GET only')
    .option('--progress', 'Print inventory progress to stderr; JSON result stays on stdout')
    .option('--out <path>', 'Save the complete remote dry-run report; refuses overwrite')
    .option('--receipt <path>', 'Required for execution: private progress/result file; refuses overwrite');
  declareContract(command, { method: 'DELETE', endpoint: '/api/v1/dataEngine?entityApiParam=:entity&id=:id',
    effects: ['write', 'deletes-exclusive-resources', 'destroys-object-data', 'native-cascades', 'preserves-shared-primitives', 'non-atomic-multi-request'],
    inputSchema: z.toJSONSchema(z.strictObject({ id: z.uuid(), confirm: z.uuid().optional(), withData: z.boolean().optional(), includeObjects: z.array(z.uuid()).optional(), expectedTenant: z.uuid().optional() })),
    serverAuthoritative: true, validation: 'Draft-only client preflight. Full visible graph, explicit data scope and matching confirmation required. Missing/inaccessible resources and unsupported dependencies block execution.' });
  command.addHelpText('after', '\nExamples:\n  fmx apps delete <uuid> --dry-run\n  fmx apps delete <uuid> --with-data --dry-run --remote --out preview.json\n  fmx apps delete <uuid> --with-data --confirm <same-uuid> --receipt receipt.json\n\nRemote previews are inventories, not write-permission checks or proof that physical tables will be removed. No force flag, automatic retry, ledger purge or SQL fallback.');
  command.action(async (id: string, options: { tenant?: string; expectedTenant?: string; withData?: boolean; includeObject: string[]; confirm?: string; remote?: boolean; progress?: boolean; out?: string; receipt?: string }) => {
    const opts: DeleteOptions = { tenant: options.tenant, expectedTenant: options.expectedTenant, withData: options.withData, includeObjects: options.includeObject, onProgress: options.progress ? info : undefined };
    validateDeleteInput(id, opts, options.confirm, isDryRun());
    if (options.remote && !isDryRun()) throw new InvalidArgumentError('--remote requires --dry-run');
    if (options.out && (!isDryRun() || !options.remote)) throw new InvalidArgumentError('--out requires --dry-run --remote');
    if (options.receipt && isDryRun()) throw new InvalidArgumentError('--receipt is for execution; use --out for a remote dry run');
    if (isDryRun() && !options.remote) {
      print({ dryRun: true, scope: 'offline-intent-only', appId: id, ...opts, writesPerformed: false, executable: false, help: 'Add --remote to inspect resources, data, cascades and blockers using GET only' }); return;
    }
    if (!isDryRun() && isReadOnly()) throw new ReadOnlyError();
    if (!isDryRun() && !options.receipt) throw new InvalidArgumentError('Execution requires --receipt <new-file> for progress and unknown outcomes');
    if (options.out && existsSync(options.out) || options.receipt && existsSync(options.receipt)) throw new InvalidArgumentError('Output already exists; choose a new file');
    const plan = await buildAppDeletePlan(id, opts);
    if (isDryRun()) {
      if (options.out) writeFileSync(options.out, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      print({ dryRun: true, scope: 'remote-visible-inventory', ...plan, ...(options.out ? { path: resolve(options.out) } : {}),
        warning: 'Preflight does not verify write permissions, all hidden/string references or physical catalog state. Deletion is sequential; draft checks are not atomic with server writes.' });
      if (!plan.executable) process.exitCode = 1; return;
    }
    if (!plan.executable) { print({ success: false, outcome: 'blocked', ...plan }); process.exitCode = 1; return; }
    const receiptPath = resolve(options.receipt!);
    closeSync(openSync(receiptPath, 'wx', 0o600));
    const save = (result: unknown) => {
      const temporary = receiptPath + '.tmp';
      try { writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); renameSync(temporary, receiptPath); }
      finally { if (existsSync(temporary)) unlinkSync(temporary); }
    };
    save({ success: false, outcome: 'preflight', fingerprint: plan.fingerprint, appId: id, tenant: plan.tenant, writesPerformed: false });
    const result = await applyAppDeletePlan(plan, opts, options.confirm!, save);
    print({ ...result, receipt: receiptPath }); if (result.success !== true) process.exitCode = 1;
  });
}
