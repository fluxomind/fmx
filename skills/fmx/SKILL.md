---
name: fmx
description: Use the FMX CLI to inspect Fluxomind tenant data, configure platform agents and apps, build or run workflows, and develop extensions. Apply when a task requires Fluxomind commands, authentication, schemas, capabilities, or execution status.
---

# FMX for agents

Use FMX for shell access to Fluxomind. The platform's remote MCP is a separate interface with separate authentication. This skill targets CLI **0.6.0**; discover the running CLI's contracts rather than assuming a command or payload exists.

## Orient, then discover only what the task needs

- If installed, use `fmx --version`, then `fmx` to see executable, API origin, current directory, project, selected tenant and stored authentication. The home is local unless the user opted into live context.
- Without a compatible installation, run `npx -y @fluxomind/cli@0.6.0`. All `fmx` examples below are shorthand for the selected executable; substitute that exact npx invocation when needed. Unversioned npm/npx commands resolve `latest`; pin the version for reproducible execution. In a source checkout, build and use `node dist/bin.js`.
- Use `fmx catalog` for top-level discovery, then `fmx catalog <command path>` or `fmx <command path> --help` for the relevant leaf. Use `--format json` for programmatic parsing. Avoid loading the whole `catalog --full`; scope `--full` to the needed branch.
- Catalog contracts expose method, endpoint, effects and inputSchema where implemented. They describe the local interface, not live permissions or server availability. Some older payloads have no catalog schema; use the command's schema/help and relevant metadata, not guessed fields.
- Carry tenant, filters and IDs forward from results. Treat `help`, `next` and `full` as discovery hints, not authorization to execute their suggested writes or setup commands.

## Establish the target and authentication

Check `fmx context show` and `fmx auth status` when identity or scope matters. Saved credentials are not proof of a valid remote session. Use `fmx tenant identity --tenant <tenant-uuid>` or `fmx auth check --tenant <tenant-uuid>` to verify the remote user and tenant without exposing credentials. Then make the narrow domain read needed for the task; identity does not prove every permission. `doctor --remote` also checks identity before health.

An explicit `--tenant` on commands that support it takes precedence over project/global defaults. Environment tokens have their own tenant scope. Never silently switch tenants after a denial. Read [context and authentication](references/context.md) for target selection, login, workspace questions or session integrations.

## Read with a small, truthful result

Use default TOON for model consumption; JSON when a parser needs it. Start with compact lists, the task's filters and only useful `--fields`. Discover an object's schema with `metadata view <object>` before constructing record payloads. Retrieve detail or `--full` only when omitted fields or truncated text matter; save exports to a file when complete JSON matters. File output prevents local display truncation; it does not remove server limits or restore omitted dependencies.

Use `--read-only` or `FMX_READ_ONLY=1` for platform exploration. This permits GET only, not read-shaped POSTs; OAuth refresh is separate, and auth/local/legacy commands reject the mode; `tenant identity` is the read-only identity probe. Prefer an existing compact summary to fetching every record to compute it.

`count` is the current page size. `total:null` and `hasMore:null` mean unknown, not zero or complete. Follow returned continuation only as far as the task requires, preserving selectors. A returned-source-window is not the entire server collection. Local field projection/windowing does not reduce server network payload; inspect `fieldProjection` and `networkPagination`. Report a successful empty result with its tenant/filters; distinguish it from denial, failure or an incomplete source.

## Prepare, execute and verify authorized changes

1. Use the returned canonical `apiName` after object creation; do not reconstruct tenant prefixes from the submitted name. If identity is unverified, inspect the returned `objectId` before retrying. Resolve the exact target and read the relevant command contract/help. Prefer governed domain commands over generic writes to platform system records. Read the matching section of [operations](references/operations.md) before writes or executions.
2. Prepare explicit payloads with exactly one of `--file <path>`, `--file -` (stdin), or `--data <json>` where supported. Use files/stdin for credentials; never print tokens or read private credential stores to discover scope.
3. Validate offline when a schema/validate command exists. Use `--dry-run` to make the request reviewable when supported. A preview is not an applied change or proof of permission: global preview stops before the first platform write, and earlier reads may occur. Auth/local setup and legacy paths are outside this guarantee.
4. Execute within the user's existing authorization and target. Resolve missing scope or authorization before the dependent action; do not ask for redundant confirmation of an already authorized operation. Hooks, live context and IDE setup require their own user intent.
5. Inspect both structured result and exit status. Use returned IDs to verify resulting state or observe the same run/job. Report applied, noop, held, waiting, partial, failed or unknown as returned; do not turn an accepted request into a claim of completion.

## Recover without duplicating effects

Exit codes: 0 success/noop/preview; 1 runtime or partial failure; 2 invalid usage. Structured results/errors go to stdout; progress goes to stderr. On usage errors, correct input using the supplied help before any retry. On 401, resolve authentication; on 403, report the denied action and scope instead of bypassing it through another interface.

After a timeout, ambiguous write or partial failure, inspect existing state and preserve result IDs, successful items and correlation/request IDs. Do not blindly retry a create, workflow run, agent invocation, job retry or apply. An idempotency header is not proof of deduplication across invocations. A wait timeout does not cancel server work; continue observing the existing ID if needed.

## References on demand

- [Context and authentication](references/context.md): tenant selection, workspace meaning, login and optional hooks.
- [Operations](references/operations.md): record concurrency/plans, workflows/jobs, agent configuration, apps, modelling/imports, files, quota, policy and extensions. Read only the relevant section.
- [All CLI capabilities](references/commands.md): every command group, with generated per-command arguments, flags/defaults and declared contracts/schemas. Choose the relevant group instead of loading every reference. Prefer the live catalog when the installed version differs.
