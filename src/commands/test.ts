import { Command } from 'commander';
import { createBundle } from '../lib/bundler';
import { validateManifestLocal } from '../lib/manifest';
import { post } from '../lib/api-client';
import { error, info, dim } from '../lib/output';

export const testCommand = new Command('test')
  .description('Run tests in the remote Deno sandbox')
  .option('-d, --dir <path>', 'Project directory', '.')
  .option('-f, --filter <pattern>', 'Filter tests by name/glob')
  .option('--json', 'Output results as JSON (NDJSON)')
  .action(async (opts: { dir: string; filter?: string; json?: boolean }) => {
    const manifest = validateManifestLocal(opts.dir);
    if (!manifest.valid) {
      error('Manifest validation failed:');
      manifest.errors.forEach((e) => error(`  ${e}`));
      process.exit(1);
    }

    const bundle = createBundle(opts.dir);
    info(`Running tests for "${manifest.manifest!.name}" (${bundle.files.length} files)...`);

    try {
      const result = await post<{
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
        results: Array<{ name: string; status: 'pass' | 'fail' | 'skip'; error?: string; duration: number }>;
      }>('/api/code-engine/test', {
        manifest: manifest.manifest,
        files: bundle.files.map((f) => ({ path: f.path, content: f.content })),
        filter: opts.filter,
      });

      for (const test of result.results) {
        if (opts.json) {
          console.log(JSON.stringify(test));
          continue;
        }

        if (test.status === 'pass') {
          console.log(`  \x1b[32m✓\x1b[0m ${test.name} ${dim(`(${test.duration}ms)`)}`);
        } else if (test.status === 'fail') {
          console.log(`  \x1b[31m✗\x1b[0m ${test.name}`);
          if (test.error) console.log(`    ${test.error}`);
        } else {
          console.log(`  \x1b[33m-\x1b[0m ${test.name} ${dim('(skipped)')}`);
        }
      }

      console.log('');
      info(`${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped ${dim(`(${result.duration}ms)`)}`);

      if (result.failed > 0) process.exit(1);
    } catch (err) {
      error(`Test execution failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
