import { Command, InvalidArgumentError } from 'commander';
import { apiRequest } from '../lib/api-client';
import { payloadOptions, readPayload, type PayloadOptions } from '../lib/command-options';
import { mutationResult } from '../lib/platform-output';
export function validateApiPath(path: string): string {
  let url: URL;
  try { url = new URL(path, 'https://fmx.invalid'); } catch { throw new InvalidArgumentError('Expected an API path beginning with /api/'); }
  if (!path.startsWith('/api/') || url.origin !== 'https://fmx.invalid' || !url.pathname.startsWith('/api/') || url.hash) throw new InvalidArgumentError('Use a relative /api/ path without a fragment; credentials are never sent to arbitrary URLs');
  return url.pathname + url.search;
}
export const apiCommand = payloadOptions(new Command('api').description('Call an authenticated platform JSON API; no automatic mutation retries').argument('<method>').argument('<path>'))
  .addHelpText('after', '\nExamples:\n  fmx api GET /api/v1/openapi.json --format json\n  fmx api POST /api/v1/dataEngine/aggregate --file aggregate.json')
  .action(async (method: string, path: string, opts: PayloadOptions) => {
    const verb = method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(verb)) throw new InvalidArgumentError('Method must be GET, POST, PUT, PATCH or DELETE');
    const endpoint = validateApiPath(path);
    const body = opts.data !== undefined || opts.file !== undefined ? readPayload(opts) : undefined;
    if (verb === 'GET' && body !== undefined) throw new InvalidArgumentError('GET does not accept --data or --file; put query parameters in the path');
    mutationResult(await apiRequest({ method: verb as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: endpoint, body, tenant: opts.tenant }));
  });
