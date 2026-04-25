# @fluxomind/cli

CLI oficial para desenvolver extensions na plataforma Fluxomind.

```bash
npm install -g @fluxomind/cli
fmx --version
```

## Primeiro deploy em <30 minutos

1. Instale o CLI (acima).
2. Rode o pre-flight check:

   ```bash
   bash $(npm root -g)/@fluxomind/cli/setup/bootstrap.sh
   ```

3. Leia o runbook embarcado:

   ```bash
   cat $(npm root -g)/@fluxomind/cli/docs/first-dev-setup.md
   ```

O runbook leva do zero ao primeiro `fmx deploy` em menos de 30 minutos e cobre:

- Autenticacao (`fmx auth login`)
- Scaffold de extension (`fmx init --git`)
- Configuracao de 5 AI clients: VS Code + Copilot, Cursor, Claude Code, Continue + Ollama (local), Continue + Anthropic
- Primeiro deploy + dev loop (`fmx dev`, `fmx logs --tail`)
- Troubleshooting dos 10 problemas mais comuns

## Comandos principais

| Comando | Uso |
|---------|-----|
| `fmx auth login` | Autentica via browser OAuth; token encrypted em `~/.fmx/config.json` |
| `fmx init <nome> --git` | Scaffold de extension + repo Git seguro |
| `fmx dev` | Watch mode — cada save deploya automaticamente |
| `fmx deploy` | Deploy manual |
| `fmx logs --tail` | Streaming de logs |
| `fmx mcp serve` | Inicia MCP Server local (stdio) para AI clients |

Lista completa: `fmx --help`.

## Configurar AI client (copia + paste)

Todos os templates vivem dentro do proprio pacote. Apos instalar o CLI:

```bash
# VS Code + Copilot
mkdir -p .vscode && cp $(npm root -g)/@fluxomind/cli/setup/configs/vscode/*.json .vscode/

# Cursor
mkdir -p .cursor && cp $(npm root -g)/@fluxomind/cli/setup/configs/cursor/mcp.json .cursor/

# Claude Code
mkdir -p .claude && cp $(npm root -g)/@fluxomind/cli/setup/configs/claude-code/settings.json .claude/

# Continue + Ollama (100% local)
mkdir -p .continue && cp $(npm root -g)/@fluxomind/cli/setup/configs/continue-ollama/config.json .continue/

# Continue + Anthropic (API key)
export ANTHROPIC_API_KEY=sk-ant-...
mkdir -p .continue && cp $(npm root -g)/@fluxomind/cli/setup/configs/continue-anthropic/config.json .continue/
```

Detalhes e validacao em `docs/first-dev-setup.md` (shippado com este pacote).

## Requisitos

- Node.js >= 18 (verifique com `node -v`)
- 1 IDE ou AI client compativel (lista acima)
- Conta ativa em um tenant Fluxomind

## Docs & Suporte

- Runbook embarcado: `$(npm root -g)/@fluxomind/cli/docs/first-dev-setup.md`
- Templates AI: `$(npm root -g)/@fluxomind/cli/setup/configs/`
- Issues & bugs: [github.com/fluxomind/platform/issues](https://github.com/fluxomind/platform/issues)
- Homepage: [docs.fluxomind.com/cli](https://docs.fluxomind.com/cli)

## Licenca

MIT — (c) Fluxomind
