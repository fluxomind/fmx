/**
 * fmx clone <extension-id> — reconstrói projeto local de extension existente.
 *
 * EVO-394 CA-6. Consome GET /api/v1/codeengine/extensions/{id}, reconstrói
 * árvore de arquivos em pasta local + gera manifest/package.json/.gitignore.
 *
 * @package @fluxomind/cli
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { get } from '../lib/api-client';
import { success, error as errorLog, info } from '../lib/output';

interface ClonedExtension {
  id: string;
  name: string;
  version: string;
  manifestToml: string;
  files: Array<{ path: string; content: string }>;
}

export const cloneCommand = new Command('clone')
  .argument('<extension-id>', 'Extension ID to clone (ex: ext_abc123)')
  .description('Clone an existing extension from the tenant into a local folder')
  .option('--dest <dir>', 'Destination directory (default: <extension-name>)')
  .option('--tenant <name>', 'Tenant to authenticate with')
  .action(async (extensionId: string, opts: { dest?: string; tenant?: string }) => {
    try {
      info(`Fetching extension ${extensionId}...`);
      const ext = await get<ClonedExtension>(
        `/api/v1/codeengine/extensions/${encodeURIComponent(extensionId)}`,
        opts.tenant,
      );

      const dest = opts.dest ?? ext.name;
      if (existsSync(dest)) {
        errorLog(`Destination "${dest}" already exists — aborting`);
        process.exit(1);
      }
      mkdirSync(dest, { recursive: true });

      writeFileSync(join(dest, 'fluxomind.extension.toml'), ext.manifestToml, 'utf-8');

      for (const file of ext.files) {
        const absPath = join(dest, file.path);
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, file.content, 'utf-8');
      }

      success(`Cloned ${ext.name}@${ext.version} into ./${dest} (${ext.files.length} files)`);
    } catch (err) {
      errorLog(`Clone failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
