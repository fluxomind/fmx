import { Command } from 'commander';
import { get, apiRequest } from '../lib/api-client';
import { recordPath } from '../lib/record-service';
import { tenantOption } from '../lib/command-options';
import { projectContext } from '../lib/project-context';
import { resolveApiUrl } from '../lib/config-manager';
import { VERSION } from '../version';
import { print } from '../lib/output';
export const doctorCommand = tenantOption(new Command('doctor').description('Offline context diagnostics; --remote explicitly enables read-only HTTP probes'))
  .option('--remote', 'Check platform health with GET; does not verify every permission')
  .option('--object <name>', 'With --remote, probe read permission for one object')
  .action(async (opts: { tenant?: string; remote?: boolean; object?: string }) => {
    const checks: { name: string; ok: boolean; result?: unknown; error?: string }[] = [];
    const project = projectContext();
    checks.push({ name: 'runtime', ok: true, result: process.version });
    if (opts.object && !opts.remote) { print({ error: '--object requires --remote', code: 'INVALID_USAGE', help: 'fmx doctor --remote --object <object>' }); process.exitCode = 2; return; }
    if (opts.remote) {
      try { const health = await apiRequest<{ status: string }>({ method: 'GET', path: '/api/health', retries: 0, timeout: 5000 }); checks.push({ name: 'platform-health', ok: health.status === 'ok', result: health }); }
      catch (err) { checks.push({ name: 'platform-health', ok: false, error: (err as Error).message }); }
      if (opts.object) {
        try { const result = await get<{ success?: boolean; error?: string }>(`${recordPath(opts.object)}&limit=1&selectFields=${encodeURIComponent('["id"]')}`, opts.tenant); if (result.success === false) throw new Error(result.error ?? 'Object read was refused'); checks.push({ name: 'object-read', ok: true, result: { object: opts.object, readable: true } }); }
        catch (err) { checks.push({ name: 'object-read', ok: false, error: (err as Error).message }); }
      }
    }
    const ok = checks.every(c => c.ok);
    print({ ok, version: VERSION, scope: opts.remote ? 'read-only-http-probes' : 'local-only', api: resolveApiUrl(), project: project ?? null, checks });
    if (!ok) process.exitCode = 1;
  });
