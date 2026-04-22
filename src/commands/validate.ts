/**
 * fmx validate — valida fluxomind.extension.toml localmente (fail-fast pre-upload).
 *
 * EVO-394 CA-4. Schema: usa validação estrutural de `manifest.ts` como MVP;
 * evolução para Zod schema canônico do MONO em iteração futura (D12).
 *
 * @package @fluxomind/cli
 */

import { Command } from 'commander';
import { validateManifestLocal } from '../lib/manifest';
import { success, error as errorLog, info } from '../lib/output';

export const validateCommand = new Command('validate')
  .description('Validate fluxomind.extension.toml against schema (exit 0 if valid, 1 if invalid)')
  .option('--path <dir>', 'Path to extension folder', '.')
  .action((opts: { path: string }) => {
    const result = validateManifestLocal(opts.path);

    if (result.valid) {
      success('Manifest is valid');
      if (result.manifest) {
        info(`  name: ${result.manifest.name}`);
        info(`  version: ${result.manifest.version}`);
      }
      process.exit(0);
    }

    errorLog('Manifest validation failed:');
    for (const err of result.errors) {
      errorLog(`  • ${err}`);
    }
    process.exit(1);
  });
