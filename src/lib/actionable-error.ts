export function actionableError(err: Error, command?: string, args: string[] = []): { help?: string; fields: Record<string, unknown> } {
  const e = err as Error & { statusCode?: number; code?: string; details?: unknown };
  const fields: Record<string, unknown> = { code: e.code ?? (e.name === 'AuthError' ? (e.message.includes('Permission denied') ? 'PERMISSION_DENIED' : 'AUTH_REQUIRED') : e.name === 'ValidationError' ? 'VALIDATION_FAILED' : e.name === 'NetworkError' ? 'NETWORK_ERROR' : 'REQUEST_FAILED') };
  if (e.statusCode !== undefined) fields.status = e.statusCode;
  if (e.details !== undefined) fields.details = e.details;
  const tenantIndex = args.indexOf('--tenant');
  // Suggestions never interpolate arbitrary user input into shell command text.
  const tenant = tenantIndex >= 0 ? args[tenantIndex + 1] : undefined;
  const suffix = tenant && /^[a-f0-9-]{36}$/i.test(tenant) ? ` --tenant ${tenant}` : '';
  if (e.message.includes('queue_age_exceeded') && command === 'run') {
    fields.code = 'WORKFLOW_QUEUE_SATURATED'; fields.operationState = 'unknown'; fields.retryable = false;
    return { fields, help: `The platform may already have created a run. Inspect fmx workflow runs${suffix} before retrying; resolve the queue issue in the platform.` };
  }
  if (/records in .* reference this record via/.test(e.message) && command === 'delete') {
    fields.code = 'DEPENDENT_RECORDS_EXIST'; fields.retryable = false;
    return { fields, help: `Inspect fmx workflow versions <id>${suffix} and dependent records. Transactional deletion requires platform support; no dependent records were deleted by FMX.` };
  }
  if (e.name === 'AuthError') return { fields, help: e.message.includes('Permission denied') ? 'Verify the account permissions and selected tenant; logging in again does not grant permissions.' : 'fmx auth login --device --tenant <tenant-uuid>' };
  if (e.statusCode === 429) return { fields, help: 'Wait for the platform rate limit to clear. Mutations are not retried automatically.' };
  if (e.statusCode === 409) return { fields, help: `Read the current record with fmx records get <object> <id>${suffix} and reconcile the conflict before retrying.` };
  if (e.name === 'NetworkError' || e.name === 'AbortError' || e.statusCode && e.statusCode >= 500) {
    fields.operationState = 'unknown'; return { fields, help: 'Inspect the remote state before repeating a mutation; a failed response does not prove that nothing changed.' };
  }
  return { fields };
}
