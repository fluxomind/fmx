# Operations and verification

Use `fmx catalog <command path>` or leaf `--help` for current flags, payload schemas and effects. Examples use the executable selected in SKILL.md. Keep payloads, exports and plans containing customer data or credentials outside Git.

## Records and declarative plans

Discover the object's API name and fields with `metadata list/view`; do not guess from display labels. Use `records list` with server filters and minimal fields, then `records get` for the selected ID. Capabilities from `access object`, `access record` or `records list --capabilities` describe the server's returned scope; a readable record does not establish create permission. The server rechecks authorization on writes.

For a change that depends on observed state, use `records update <object> <id> --expected '<baseline-json>' --file <change.json>`. `--expected` is server compare-and-swap for those field values. On conflict, reread and reconcile the user's desired change; do not discard the baseline and force the original update. `agent update` also supports `--expected`. Batch updates do not support `expectedValues`; use individual conditional updates or plans when concurrency matters. Batch exit 1 can include successful items: preserve them rather than repeating the entire batch.

Use declarative resources for several customer record fields when a reviewed diff is useful:

```sh
fmx resources schema --format json
fmx resources validate --file <manifest.json>
fmx --read-only resources plan --file <manifest.json> --remote --out <plan.json>
fmx --read-only --dry-run resources apply --file <plan.json>
# Within authorization for the reviewed changes:
fmx resources apply --file <plan.json> --tenant <tenant-uuid>
```

- A manifest uses `apiVersion: fmx/v1`, `apiOrigin`, `tenant` and `resources`; each resource has a key, object, data and exactly one of `id` or equality `match`. Request `resources schema` for the full contract.
- Offline validation does not observe remote state. `plan --remote` reads schemas/current records and saves create/update/noop actions with baselines; `--out` requires remote planning and refuses overwrite.
- Plans pin the API origin and tenant. They reject ambiguous identities, unknown/identity/audit/credential fields and duplicate targets. An absent explicit ID is an error, not permission to create. System `fm_` objects require domain commands.
- `apply --dry-run` sends no HTTP and reports `state: not-rechecked`; it does not prove the baseline is still current. Remote schema/record reads use bounded concurrency (four at a time), with shared schema reads per object. Writes remain ordered. Real apply rechecks **all** baselines before its first write and uses conditional updates. This is not a multi-record transaction.
- Apply stops on partial failure; it does not automatically resume or roll back. A create lookup is not atomic uniqueness or guaranteed deduplication. After an unknown result, inspect existing records before proposing another create.
- Complete plan/export files may contain customer values; stdout is compact by default. Use `--full` only when those values must be reviewed, and choose a new filename rather than overwriting an existing reviewed artifact.

## Workflows and jobs

Use `workflow schema` for definition shape and `workflow actions list/view` for action contracts. `workflow validate --file <workflow.json>` is offline; `--remote` reads action schemas only. Validation does not execute code, prove downstream output semantics or replace server publication/execution checks.

`workflow create/update` saves a draft. `workflow publish <id>` creates an immutable version; `workflow rollback <id> <versionId>` creates a new version from a prior one. These are separate effects. Export with `workflow export <id> --out <path>` for lossless JSON; diff compares definitions, not dependency drift. Exports do not include credentials or all referenced resources.

`workflow run <id> --wait` starts one run and observes that ID. `waiting` is suspended, not completed. Timeout or observation failure does not cancel the run. Observation polling backs off within the original deadline; it does not restart work. Continue with `workflow runs get <run-id>`; do not start another execution to check status. If no run ID was returned after an ambiguous response, inspect runs for the intended definition and report uncertainty rather than guessing one.

`jobs get/wait` observes existing work. `jobs retry`, schedules `run-now`, cancel and reschedule change server state or execute work; they are not diagnostics. Readiness/score operations can also persist state: inspect the contract before treating a command as read-only. Return run/job IDs and the observed terminal or suspended state to the user.

## Platform agents and knowledge

Use `agent get/export` before adapting existing configuration. `agent export --out` preserves the platform portable payload, not necessarily every dependency. `agent import` requires an explicit create/update/merge mode; inspect help and resolve referenced model/knowledge IDs before execution. `agent invoke` executes the agent; it is not a configuration check.

Use `agent models` for server-governed model slots/assignments, `agent tools` for the tool catalog and allowlist, and `agent workers` for delegation. `agent tools set` **replaces** the allowlist: read current tools and retain intended entries when adding one. The platform validates model/tool compatibility. A worker agent ID is distinct from its binding ID: link receives `workerId`; update/unlink use `bindingId`.

Knowledge linking uses existing bases. Unlink takes a `junctionId` and removes the association, not the base or its documents. `knowledge ingest` accepts text for an existing base; do not promise chunking, masking or embedding options ignored by the current route. Stored knowledge status does not prove that all chunks/embeddings are ready.

## Apps, modelling and human decisions

For a complete app from a published template, discover `apps templates` and use `apps create --template <id>`. The platform owns instantiation of the template's resources. JSON-based `apps create` requires name/namespace and creates **application identity only**, not pages/navigation/members. Its same-namespace no-op lookup is not atomic uniqueness. Dry runs do not verify all template resources or write permissions.

`apps components` edits existing pages. Component update `version` enables server conflict checks; deleting a component also removes descendants. For draft app deletion, read [draft cleanup](app-deletion.md) and use `apps delete` rather than assembling generic CRUD calls. Full app/page/menu/member composition still lacks a complete public server contract.

Use modelling/lifecycle commands for object and field changes; a retirement can schedule a future purge. `outcome: held, completed:false` means the change is awaiting a decision, not applied. Workflow approval tasks and personal policy HITL decisions are separate resources. A policy decision does not itself prove durable workflow resumption; inspect the execution afterward. Dependency denial is not authorization to delete linked resources.

## Extensions and local setup

For extension development, discover `init`, `validate`, `dev`, `deploy`, `test`, `logs` and `publish` from their own help. `fmx validate` checks the extension manifest locally; top-level `publish` submits an extension to the marketplace and differs from `workflow publish` and npm publication.

These legacy/local paths are not protected by the platform global read-only/dry-run guarantees. Although `deploy` has its own dry-run option, inspect its actual help and behavior rather than assuming the global preview interception applies. `init --git` can provision/push a remote repository; public repository confirmation must not be bypassed with `--force` without user intent. `dev-env setup` writes IDE configuration and its default smoke check can deploy; use `--skip-smoke` when deployment is outside the task, and supply explicit `--ai-clients` instead of interactive prompts for agent automation.

## Modelling, exports and files

`model create-object` returns the server's canonical `apiName` after reading the returned `objectId`. Use that name for later commands. If `identityState: unverified`, preserve the object ID and inspect it; do not create another object to resolve the name. `catalog model create-object/create-field --full` exposes input schemas.

`model retire-object <apiName>` is soft retirement with a scheduled purge, not immediate physical deletion. `model restore-object <apiName>` asks the lifecycle service to restore within its retention window; dependencies and authorization remain server-controlled.

`model export <name1,name2> --out <new.json>` writes full received JSON with private permissions and refuses overwrite. Its `completeness: not-guaranteed` is material: the platform caps source collections and may omit dependent metadata. Never present it as a complete backup. `model import --file <export.json>` only restores supported object/field metadata; referenced IDs are not automatically portable between tenants. It rejects nonempty indexes/triggers/validations because the route would ignore them. Inspect per-object results and exit status; partial imports are not transactions and must not be blindly repeated. An export endpoint failure is a server capability gap, not permission to read internal storage.

`files upload <path> --mime <type>` uploads one file (maximum 100 MiB); `--folder <id>` is optional. `--dry-run` prints metadata without reading/uploading contents. Use fictitious input for tests and retain the returned file ID for cleanup. `files get <id>` reads links/shares; `files for-target <object> <id>` lists attachments. Discover `files link/unlink` schemas before constructing payloads. Linking to knowledge with `relation_type: knowledge_source` may trigger ingestion; an accepted link does not prove indexing is complete. The disabled legacy chunk-ingestion route is not exposed as a working command.

`files unlink` removes a relationship; `files delete <id>` deletes only an unreferenced file and leaves dependency decisions to the server. Do not unlink real dependencies just to make deletion succeed. `tenant quota` reads usage/limits; quota is not an authorization check.

`deploy --git` fails explicitly as unsupported. `dev` reads only changed paths after its initial snapshot and serializes uploads, but the current upload endpoint's acceptance is not evidence of an actual deployment. Deleted source paths are reported as unsupported; do not claim they were removed remotely. `logs --tenant <uuid> --follow` uses the same selected session as REST; a 401/403 ends observation instead of reconnecting indefinitely.
