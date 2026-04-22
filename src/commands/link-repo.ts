/**
 * fmx link-repo <url> — conecta projeto local a repo Git existente.
 *
 * EVO-394 CA-7. Schema validation URL (github.com ou gitlab.com only),
 * configura `git remote add origin <url>`, atualiza [repository] no manifest.
 * NÃO clona código — apenas liga projeto local a remote existente.
 *
 * @package @fluxomind/cli
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { success, error as errorLog, info, warn } from '../lib/output';

const ALLOWED_HOSTS = ['github.com', 'gitlab.com'];

function validateRepoUrl(url: string): { ok: true; host: string } | { ok: false; reason: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return { ok: false, reason: 'URL must use https://' };
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return { ok: false, reason: `Host must be one of ${ALLOWED_HOSTS.join(', ')}` };
    }
    if (parsed.pathname.split('/').filter(Boolean).length < 2) {
      return { ok: false, reason: 'URL must include <org>/<repo>' };
    }
    return { ok: true, host: parsed.hostname };
  } catch {
    return { ok: false, reason: 'Not a valid URL' };
  }
}

export const linkRepoCommand = new Command('link-repo')
  .argument('<url>', 'Remote repository URL (github.com or gitlab.com, https://)')
  .description('Link local extension to an existing remote repo without creating a new one')
  .option('--path <dir>', 'Path to extension folder', '.')
  .action((url: string, opts: { path: string }) => {
    const validation = validateRepoUrl(url);
    if (!validation.ok) {
      errorLog(`Invalid repo URL: ${validation.reason}`);
      process.exit(1);
    }

    const manifestPath = join(opts.path, 'fluxomind.extension.toml');
    if (!existsSync(manifestPath)) {
      errorLog(`No fluxomind.extension.toml found in ${opts.path}`);
      process.exit(1);
    }

    try {
      // Initialize git if needed + set remote
      if (!existsSync(join(opts.path, '.git'))) {
        execSync('git init', { cwd: opts.path, stdio: 'pipe' });
      }

      // Check if origin exists
      let hasOrigin = false;
      try {
        execSync('git remote get-url origin', { cwd: opts.path, stdio: 'pipe' });
        hasOrigin = true;
      } catch {
        // no origin — that's fine
      }

      if (hasOrigin) {
        warn('Remote "origin" already set — replacing');
        execSync(`git remote set-url origin ${url}`, { cwd: opts.path, stdio: 'pipe' });
      } else {
        execSync(`git remote add origin ${url}`, { cwd: opts.path, stdio: 'pipe' });
      }

      // Update [repository] section in toml (simple append if missing)
      const content = readFileSync(manifestPath, 'utf-8');
      if (!content.includes('[repository]')) {
        writeFileSync(
          manifestPath,
          `${content.trimEnd()}\n\n[repository]\nurl = "${url}"\nhost = "${validation.host}"\n`,
          'utf-8',
        );
      } else {
        warn('[repository] section already exists in manifest — not overwriting (edit manually)');
      }

      success(`Linked to ${url} (git remote origin + manifest updated)`);
      info('Next: git add -A && git commit -m "link remote" && git push -u origin main');
    } catch (err) {
      errorLog(`link-repo failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
