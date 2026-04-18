# Fluxomind — next steps

Your workspace is now wired up. Quick tour:

## 1. Write code

Create an extension entry at `src/main.ts`:

```ts
import type { FmxExtension } from '@fluxomind/sdk';

export default {
  onDeploy: async (ctx) => {
    const customers = await ctx.fm.data.find('customer', { limit: 10 });
    ctx.log.info(`Found ${customers.length} customers`);
  },
} satisfies FmxExtension;
```

## 2. Run the watch loop

```bash
fmx dev
```

Edits are type-checked and replayed against the Fluxomind runtime. Logs stream live.

## 3. Use AI tools in your IDE

Open this folder in VS Code / Cursor / Claude Code. The MCP server is wired — ask your chat:

- "list my Fluxomind objects"
- "query customer where region = 'EU'"
- "deploy the current extension"

Your AI client will call the `fmx mcp serve` stdio server with your CLI auth.

## 4. Deploy

```bash
fmx deploy
```

Direct deploy — no Git required. Or wire GitHub later via:

```bash
fmx auth login   # tenant session
fmx dev-env setup   # re-run wizard to add Git connection
```

## 5. Diagnostics

```bash
fmx dev-env doctor
```

Reports which AI clients are wired, MCP server reachability, and config drift.

## Presets wired

You picked a preset — `fmx dev-env doctor` shows the exact list. Switch or add presets anytime by re-running `fmx dev-env setup`.

## Troubleshooting

- AI client can't find tools → check that `fmx mcp serve` is reachable (`fmx dev-env doctor`).
- Ollama missing → install from https://ollama.com and pull `qwen2.5-coder:7b`.
- Auth expired → `fmx auth login`.

Full runbook: `cat $(npm root -g)/@fluxomind/cli/docs/first-dev-setup.md`.
