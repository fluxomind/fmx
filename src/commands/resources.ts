import { Command, InvalidArgumentError } from 'commander';
import { z } from 'zod';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { payloadOptions, readPayload, type PayloadOptions } from '../lib/command-options';
import { applyResourcePlan, assertPlanTarget, buildResourcePlan, parseManifest, parsePlan, resourceManifestSchema, summarizePlan } from '../lib/resource-plan';
import { isDryRun } from '../lib/dry-run';
import { isReadOnly, ReadOnlyError } from '../lib/request-policy';
import { print } from '../lib/output';
import { mutationResult } from '../lib/platform-output';
export const resourcesCommand = new Command('resources').description('Declarative DataEngine record fields: validate, plan and conditionally apply; no automatic deletes');
resourcesCommand.command('schema').description('Offline manifest schema; semantic identity checks are also required').action(() => print({ schema: z.toJSONSchema(resourceManifestSchema), help: 'fmx resources validate --file manifest.json' }));
payloadOptions(resourcesCommand.command('validate').description('Validate manifest and target shape offline; no authentication or HTTP')).action((opts: PayloadOptions) => {
  const manifest = parseManifest(readPayload(opts)); print({ valid: true, scope: 'local-only', apiVersion: manifest.apiVersion, count: manifest.resources.length });
});
payloadOptions(resourcesCommand.command('plan').description('Offline validation by default; --remote reads schema and current records to calculate changes'))
  .option('--remote', 'Calculate a plan using GET only').option('--out <path>', 'Save a complete remote plan; refuses overwrite').option('--full', 'Include payloads and baselines in output')
  .action(async (opts: PayloadOptions & { remote?: boolean; out?: string }) => {
    if (opts.out && !opts.remote) throw new InvalidArgumentError('--out requires --remote; offline validation cannot produce an executable plan');
    if (opts.out && existsSync(opts.out)) throw new InvalidArgumentError('Plan output already exists; choose a new path');
    const manifest = parseManifest(readPayload(opts)); assertPlanTarget(manifest, opts.tenant);
    if (!opts.remote) { print({ valid: true, scope: 'local-only', count: manifest.resources.length, state: 'not-observed', writesPerformed: false, help: 'Add --remote --out <plan.json> for a read-only comparison' }); return; }
    const plan = await buildResourcePlan(manifest, opts.tenant);
    if (opts.out) writeFileSync(opts.out, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    print({ ...(opts.full ? plan : summarizePlan(plan)), writesPerformed: false, ...(opts.out ? { path: resolve(opts.out) } : {}) });
  });
payloadOptions(resourcesCommand.command('apply').description('Apply a reviewed remote plan sequentially with conditional updates; --dry-run sends no HTTP'))
  .action(async (opts: PayloadOptions) => {
    const plan = parsePlan(readPayload(opts)); assertPlanTarget(plan, opts.tenant);
    if (isDryRun()) { print({ ...summarizePlan(plan), dryRun: true, scope: 'local-plan-preview', writesPerformed: false, state: 'not-rechecked' }); return; }
    if (isReadOnly()) throw new ReadOnlyError();
    mutationResult(await applyResourcePlan(plan, opts.tenant));
  });
