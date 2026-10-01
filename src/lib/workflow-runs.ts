import { apiRequest } from './api-client';
import { recordPath } from './record-service';
import { type JsonRecord } from './command-options';
const stopped = new Set(['waiting', 'resolved', 'closed', 'failed', 'cancelled']);
export function runId(result: JsonRecord): string | undefined {
  const id = result.workflowRunId ?? result.workflow_run_id ?? result.runId ?? result.id;
  return typeof id === 'string' && id ? id : undefined;
}
export async function waitForRun(id: string, tenant: string | undefined, timeout: number, interval: number): Promise<JsonRecord> {
  const deadline = Date.now() + timeout;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { workflowRunId: id, outcome: 'timeout', help: `fmx workflow runs get ${id}`, continuesOnServer: true };
    let run: JsonRecord;
    try { run = await apiRequest<JsonRecord>({ method: 'GET', path: recordPath('fm__workflow_run', id), tenant, timeout: remaining, retries: 0 }); }
    catch (err) { if (Date.now() >= deadline) return { workflowRunId: id, outcome: 'timeout', help: `fmx workflow runs get ${id}`, continuesOnServer: true }; throw err; }
    if (run.success === false) throw new Error(typeof run.error === 'string' ? run.error : 'Platform refused to read the workflow run');
    if (stopped.has(String(run.status))) return { workflowRunId: id, outcome: ['failed', 'cancelled', 'waiting'].includes(String(run.status)) ? run.status : 'completed', run };
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - Date.now()))));
  }
}
