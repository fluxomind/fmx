# Context and authentication

## Resolve identity without exposing credentials

`fmx` reports the selected executable/version, API origin, cwd, project and stored tenant sessions. `fmx context show` reports local project context; `fmx auth status` lists **locally saved** tenant credentials, including expiry metadata. Neither enumerates every workspace the user can access remotely or proves that a token is currently accepted.

This CLI has no `workspaces list` command. In `context`, workspace means the local directory bound to a tenant in `.fmx/project.json`. When asked to list workspaces, distinguish local contexts, saved tenant sessions and a remote workspace directory. State the supported scope; do not invent a route or imply `auth status` is a complete remote tenant listing.

For stored sessions, target selection is: explicit `--tenant` where supported, nearest project context, global default tenant, then a saved tenant fallback. A malformed project context fails; do not work around it by silently using a different tenant. With `FLUXOMIND_ACCESS_TOKEN`, API calls use the environment token's identity; a local selector does not change that token's scope. Remote resource planning/apply verifies environment-token identity before using the manifest tenant, including opaque tokens. A dry run remains offline and does not prove token scope. Saved CLI sessions share tenant selection and refresh across REST and SSE, and send the same canonical session credential to internal session routes; environment credentials remain Bearer-only. Concurrent refreshes in one process share one renewal. API origin may be configured independently. Check both origin and tenant before changes.

The environment label (`development`, `test`, `production`) is informational, not a server isolation boundary or a production write guard. `context init --tenant <uuid> --environment <name>` creates a local file and refuses overwrite; do it when a persistent project binding is requested, not for a one-off query that can use `--tenant`.

## Confirm a remote session

Verify remote identity, then the permission needed for the task:

```sh
fmx --read-only tenant identity --tenant <tenant-uuid>
fmx auth check --tenant <tenant-uuid>
fmx --read-only metadata list --tenant <tenant-uuid> --limit 1
```

A successful read verifies that request and its permission, not all platform capabilities. `doctor --remote` verifies user/tenant first, then checks health; add `--object <object>` for a domain-read probe. A healthy service does not establish every permission. A 403 is a denied request, not evidence that the collection is empty.

If login is needed, use `fmx auth login --device --tenant <tenant-uuid>` and let the user complete browser/device authentication. The tenant must be a UUID, not a slug. Never fabricate an ID, ask for a token in chat, or copy private stores into output. CLI login does not log the user's MCP client into the platform.

## Optional session integrations

AXI offers ambient session context and an on-demand skill as complementary paths. Install hooks only when requested:

```sh
fmx agents status --scope project
fmx agents setup --scope project
```

Use `--scope user` only for a requested user-wide installation. Setup installs/repairs managed integrations for Claude Code, Codex and OpenCode; it can also enable Codex hooks in user configuration. `agents remove` removes FMX-managed integrations. `agent` (singular) manages platform agents; `agents` (plural) manages these local integrations.

The ordinary home is local. `context init ... --live-context` explicitly enables GET-only live dashboard context, including when a hook invokes FMX. Never enable it as a hidden part of inspection, login or skill installation.
