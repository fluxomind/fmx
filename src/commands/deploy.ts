import { Command } from 'commander';
import { validateManifestLocal } from '../lib/manifest';
import { createBundle, validateBundleSize } from '../lib/bundler';
import { post } from '../lib/api-client';
import { success, error, info, warn, dim, table } from '../lib/output';
import { isInteractive } from '../lib/output';

export const deployCommand = new Command('deploy')
  .description('Deploy extension to the platform')
  .option('-d, --dir <path>', 'Project directory', '.')
  .option('--dry-run', 'Validate and preview without deploying')
  .option('--git', 'Deploy via Git push (requires EVO-163 GitHub integration)')
  .option('--env <environment>', 'Target environment', 'production')
  .option('--version <semver>', 'Override version')
  .option('--force', 'Bypass strict manifest validation for emergency hotfix (EVO-394 CA-9). Audit trail records deploy_source=cli_force')
  .action(async (opts: { dir: string; dryRun?: boolean; git?: boolean; env: string; version?: string; force?: boolean }) => {
    // Validate manifest locally (fail fast) — --force bypasses errors but still parses
    const manifest = validateManifestLocal(opts.dir);
    if (!manifest.valid) {
      if (opts.force) {
        warn('Manifest validation failed — bypassing due to --force (emergency hotfix):');
        manifest.errors.forEach((e) => warn(`  ${e}`));
      } else {
        error('Manifest validation failed:');
        manifest.errors.forEach((e) => error(`  ${e}`));
        process.exit(1);
      }
    }

    if (opts.git) {
      info('Git deploy: pushing to remote and waiting for webhook...');
      warn('Git deploy requires GitHub integration (EVO-163). Use `fmx deploy` for direct upload.');
      // TODO: git push + SSE/polling for webhook confirmation
      return;
    }

    // Bundle files
    const bundle = createBundle(opts.dir);
    const sizeCheck = validateBundleSize(bundle);
    if (!sizeCheck.valid) {
      error(sizeCheck.warning!);
      process.exit(1);
    }
    if (sizeCheck.warning) warn(sizeCheck.warning);

    info(`Bundle: ${bundle.files.length} files, ${(bundle.totalSize / 1024).toFixed(1)}KB, hash: ${dim(bundle.totalHash)}`);

    if (opts.dryRun) {
      info('Dry run — preview:');
      table(bundle.files.map((f) => ({ file: f.path, hash: f.hash, size: `${(f.content.length / 1024).toFixed(1)}KB` })));
      success('Validation passed. Ready to deploy.');
      return;
    }

    // Production confirmation
    if (opts.env === 'production' && !opts.force && isInteractive()) {
      info(`Deploying to ${opts.env}. Use --force to skip confirmation.`);
      // In real implementation: readline prompt
    }

    try {
      const result = await post<{
        version: string;
        triggers: number;
        duration: number;
        url: string;
      }>('/api/code-engine/deploy', {
        manifest: manifest.manifest,
        files: bundle.files.map((f) => ({ path: f.path, content: f.content })),
        hash: bundle.totalHash,
        version: opts.version,
        environment: opts.env,
        deploy_source: opts.force ? 'cli_force' : 'cli',
      });

      success(`Deployed: ${manifest.manifest!.name} v${result.version} ${dim(`(${result.duration}ms)`)}`);
      if (result.triggers > 0) info(`  Triggers: ${result.triggers} active`);
      info(`  URL: ${dim(result.url)}`);
    } catch (err) {
      error(`Deploy failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
