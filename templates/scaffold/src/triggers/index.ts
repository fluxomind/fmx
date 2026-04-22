/**
 * Default trigger handler — replace with your own logic.
 * Docs: https://docs.fluxomind.dev/fmcode/triggers
 */
export default async function handler(ctx: fm.TriggerContext) {
  const { operation, record, oldRecord } = ctx;
  fm.utils.log(`Trigger: ${operation} on ${ctx.objectApiName}`);
  return { success: true };
}
