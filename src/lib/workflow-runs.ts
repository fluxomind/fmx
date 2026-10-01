import { apiRequest } from './api-client';
import { recordPath } from './record-service';
import { type JsonRecord } from './command-options';
import { poll } from './poll';
const stopped = new Set(['waiting', 'resolved', 'closed', 'failed', 'cancelled']);
export function runId(result: JsonRecord): string | undefined {
  const id = result.workflowRunId ?? result.workflow_run_id ?? result.runId ?? result.id;
  return typeof id === 'string' && id ? id : undefined;
}
export async function waitForRun(id: string, tenant: string | undefined, timeout: number, interval: number): Promise<JsonRecord> {
  const result = await poll({ timeout, interval, read: async remaining => {
    const run = await apiRequest<JsonRecord>({ method: 'GET', path: recordPath('fm__workflow_run', id), tenant, timeout: remaining, retries: 0 });
    if (run.success === false) throw new Error(typeof run.error === 'string' ? run.error : 'Platform refused to read the workflow run');
    return run;
  }, stopped: run => stopped.has(String(run.status)) });
  if (result.outcome === 'timeout') return { workflowRunId: id, outcome: 'timeout', help: `fmx workflow runs get ${id}`, continuesOnServer: true };
  const run = result.value;
  return { workflowRunId: id, outcome: ['failed', 'cancelled', 'waiting'].includes(String(run.status)) ? run.status : 'completed', run };
}
