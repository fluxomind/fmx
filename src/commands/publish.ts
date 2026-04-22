/**
 * fmx publish — submits extension to the tenant marketplace.
 *
 * EVO-394 CA-5. Runs `fmx validate` first; on success, POSTs to
 * /api/v1/appstore/submissions. Flag --public submits to global marketplace
 * (requires platform scope — server gates via 403 FORBIDDEN_PUBLIC_SUBMIT).
 *
 * @package @fluxomind/cli
 */

import { Command } from 'commander';
import { createHash } from 'crypto';
import { post } from '../lib/api-client';
import { validateManifestLocal } from '../lib/manifest';
import { success, error as errorLog, info } from '../lib/output';

interface SubmissionResponse {
  submissionId: string;
  appId: string;
  status: string;
}

export const publishCommand = new Command('publish')
  .description('Submit extension to marketplace (tenant default; --public for global)')
  .option('--public', 'Submit to global marketplace (requires platform scope)')
  .option('--path <dir>', 'Path to extension folder', '.')
  .option('--tenant <name>', 'Tenant to authenticate with')
  .action(async (opts: { public?: boolean; path: string; tenant?: string }) => {
    const validation = validateManifestLocal(opts.path);
    if (!validation.valid || !validation.manifest) {
      errorLog('Cannot publish — manifest invalid. Fix errors and retry:');
      for (const err of validation.errors) errorLog(`  • ${err}`);
      process.exit(1);
    }

    const manifest = validation.manifest;
    const manifestHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

    try {
      info(`Submitting ${manifest.name}@${manifest.version}${opts.public ? ' to global marketplace' : ''}...`);

      const body = {
        manifest: {
          appId: manifest.name,
          name: manifest.name,
          version: manifest.version,
          permissions: Object.keys(manifest.permissions ?? {}),
          description: manifest.description,
          hash: manifestHash,
        },
        isPublic: opts.public ?? false,
      };

      const response = await post<SubmissionResponse>(
        '/api/v1/appstore/submissions',
        body,
        opts.tenant,
      );

      success(`Submission accepted: ${response.submissionId} (status: ${response.status})`);
    } catch (err) {
      errorLog(`Publish failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
