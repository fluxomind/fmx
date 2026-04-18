import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline/promises';
import { success, error, info, warn } from '../lib/output';
import { post, AuthError, ServerError, NetworkError } from '../lib/api-client';
import {
  createProject as scaffoldCreateProject,
  isKebabCase,
  isValidTemplateKind,
  ScaffoldError,
  type TemplateKind,
  GITIGNORE_TEMPLATE,
  README_TEMPLATE,
  README_PLACEHOLDER,
  renderReadme,
} from '../lib/scaffold';

// Re-export template constants for backwards compatibility with existing tests.
// Shared between CLI and MCP scaffold-adapter via `../lib/scaffold`.
export { GITIGNORE_TEMPLATE, README_TEMPLATE, README_PLACEHOLDER, renderReadme };
export type { TemplateKind };

export async function confirmPublicVisibility(isInteractive: boolean): Promise<boolean> {
  if (!isInteractive) {
    error('--public requires --force in non-interactive (CI) environments.');
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      '⚠ Publicar repo como PUBLIC? Código + issues serão visíveis. [y/N] ',
    );
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

interface ProvisionRepoResponse {
  repoUrl: string;
  repoFullName: string;
  defaultBranch: string;
}

interface ProvisionRepoRequest {
  name: string;
  template: TemplateKind;
  visibility: 'private' | 'public';
}

async function provisionRemoteRepo(
  body: ProvisionRepoRequest,
): Promise<{ ok: true; data: ProvisionRepoResponse } | { ok: false; reason: string; recoverable: boolean }> {
  try {
    const data = await post<ProvisionRepoResponse>('/api/code-engine/extensions/provision-repo', body);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, reason: err.message, recoverable: true };
    }
    if (err instanceof ServerError && err.statusCode === 424) {
      return {
        ok: false,
        reason: 'GitHub connection not configured for this tenant.',
        recoverable: true,
      };
    }
    if (err instanceof ServerError) {
      return { ok: false, reason: `Platform error (${err.statusCode}): ${err.message}`, recoverable: false };
    }
    if (err instanceof NetworkError) {
      return { ok: false, reason: `Network error: ${err.message}`, recoverable: true };
    }
    return { ok: false, reason: (err as Error).message, recoverable: false };
  }
}

interface LocalGitResult {
  ok: boolean;
  pushed?: boolean;
  error?: string;
}

async function gitInitLocal(
  dir: string,
  remote?: { url: string; branch: string; push: boolean },
): Promise<LocalGitResult> {
  try {
    const { execSync } = await import('child_process');
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git add .', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "chore: initial scaffold"', { cwd: dir, stdio: 'pipe' });
    if (!remote) return { ok: true };
    execSync(`git branch -M ${remote.branch}`, { cwd: dir, stdio: 'pipe' });
    execSync(`git remote add origin ${remote.url}`, { cwd: dir, stdio: 'pipe' });
    if (!remote.push) return { ok: true, pushed: false };
    try {
      execSync(`git push -u origin ${remote.branch}`, { cwd: dir, stdio: 'pipe' });
      return { ok: true, pushed: true };
    } catch (pushErr) {
      return { ok: true, pushed: false, error: (pushErr as Error).message };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export const initCommand = new Command('init')
  .description('Scaffold a new extension project')
  .argument('<name>', 'Extension name (kebab-case)')
  .option('-t, --template <type>', 'Template type: extension, trigger, module', 'extension')
  .option('--git', 'Initialize Git repo (creates remote if GitHub connected)')
  .option('--public', 'Create public repo (requires confirmation or --force)')
  .option('--force', 'Skip interactive confirmations (for CI)')
  .action(async (
    name: string,
    opts: { template: string; git?: boolean; public?: boolean; force?: boolean },
  ) => {
    if (!isKebabCase(name)) {
      error(`Invalid name "${name}". Use kebab-case (e.g., my-extension).`);
      process.exit(1);
    }

    if (!isValidTemplateKind(opts.template)) {
      error(`Unknown template "${opts.template}". Use: extension, trigger, module.`);
      process.exit(1);
    }

    const kind: TemplateKind = opts.template;
    const dir = join(process.cwd(), name);

    if (existsSync(dir)) {
      error(`Directory "${name}" already exists.`);
      process.exit(1);
    }

    if (opts.public && !opts.force) {
      const isTty = process.stdout.isTTY === true && process.env.CI !== 'true';
      const confirmed = await confirmPublicVisibility(isTty);
      if (!confirmed) {
        info('Aborted — repo remains private by default. Re-run without --public.');
        process.exit(0);
      }
    }

    const visibility: 'private' | 'public' = opts.public ? 'public' : 'private';

    try {
      scaffoldCreateProject({ name, type: kind });
    } catch (scaffoldErr) {
      if (scaffoldErr instanceof ScaffoldError) {
        error(scaffoldErr.message);
      } else {
        error((scaffoldErr as Error).message);
      }
      process.exit(1);
    }

    success(`Created ${kind} "${name}" (${visibility})`);
    info(`  cd ${name}`);
    info(`  fmx dev    # start development`);

    if (!opts.git) {
      return;
    }

    const result = await provisionRemoteRepo({ name, template: kind, visibility });

    if (result.ok) {
      const branch = result.data.defaultBranch || 'main';
      const gitResult = await gitInitLocal(dir, {
        url: result.data.repoUrl,
        branch,
        push: true,
      });
      if (!gitResult.ok) {
        warn(`Remote repo created but local Git init failed: ${gitResult.error ?? 'unknown error'}`);
        info(`  cd ${name} && git init && git remote add origin ${result.data.repoUrl}`);
        return;
      }
      success(`Remote repository created: ${result.data.repoUrl} (${visibility})`);
      if (gitResult.pushed) {
        success(`Pushed initial scaffold to origin/${branch}`);
      } else {
        warn(`Local commit ready but push failed — retry with: git push -u origin ${branch}`);
        if (gitResult.error) info(`  Reason: ${gitResult.error.split('\n')[0]}`);
      }
      return;
    }

    const gitResult = await gitInitLocal(dir);
    if (!gitResult.ok) {
      warn(`Git initialization failed — project created without Git: ${gitResult.error ?? 'unknown error'}`);
      return;
    }
    success('Git repository initialized locally');
    if (result.recoverable) {
      warn(`Remote repo not provisioned: ${result.reason}`);
      info('  To enable remote provisioning:');
      info('    1. Run `fmx auth login` to authenticate with the platform');
      info('    2. Ensure your tenant has a GitHub App connection (admin setting)');
      info('    3. Re-run `fmx init` on a new project or add the remote manually');
    } else {
      error(`Remote provisioning failed: ${result.reason}`);
    }
  });
