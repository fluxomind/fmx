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
| `fmx metadata list` / `fmx query <object>` | Consulta o tenant pela CLI |

Lista completa: `fmx --help`.

## Configuracao do endpoint da plataforma

O CLI resolve a URL da plataforma na seguinte ordem de precedencia (padrao
industria — AWS CLI, gcloud, kubectl):

1. **Flag** `--api-url <url>` (override pontual, util para debug)
2. **Env var** `FLUXOMIND_API_URL` (recomendado para CI/CD e dev local)
3. **Config file** `~/.fmx/config.json` campo `apiBaseUrl`
4. **Default** `https://platform.fluxomind.com`

### Exemplos

Zero-config (default — producao):

```bash
fmx auth login
# bate em https://platform.fluxomind.com
```

Override via env var (dev local ou CI):

```bash
export FLUXOMIND_API_URL=http://localhost:3000
fmx auth login
```

Override pontual via flag (debug):

```bash
fmx auth login --api-url https://staging.fluxomind.com
```

Persistente via config file:

```json
{ "apiBaseUrl": "https://staging.fluxomind.com" }
```

### Comportamento de fallback

- Config file com JSON invalido → CLI imprime warning em stderr e usa o default.
- URL resolvida nao-HTTPS e nao-localhost → CLI imprime warning em stderr (nao bloqueia).

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

- Node.js >= 22.12 (verifique com `node -v`)
- 1 IDE ou AI client compativel (lista acima)
- Conta ativa em um tenant Fluxomind

## Docs & Suporte

- Runbook embarcado: `$(npm root -g)/@fluxomind/cli/docs/first-dev-setup.md`
- Templates AI: `$(npm root -g)/@fluxomind/cli/setup/configs/`
- Issues & bugs: [github.com/fluxomind/platform/issues](https://github.com/fluxomind/platform/issues)
- Homepage: [docs.fluxomind.com/cli](https://docs.fluxomind.com/cli)

## Licenca

MIT — (c) Fluxomind

## Interface para agentes · 0.4

FMX é a CLI; o servidor MCP pertence à plataforma. Esta versão remove `fmx mcp serve`. Os presets apontam para `https://platform.fluxomind.com/api/mcp`; autentique o MCP no seu cliente, separadamente do FMX.

```sh
fmx                              # contexto atual, sem tokens
fmx auth login --device --tenant <tenant-uuid>
fmx metadata list --limit 100
fmx query fm__object --limit 2 --fields id,name,api_name
fmx --format json auth status
```

Saída padrão TOON, `--format json` para automação. Progresso vai para stderr; resultados e erros para stdout. Node >=22.12 é obrigatório. Veja a [análise da stack e limites da adoção AXI](docs/modernizacao-axi.md).

Integrações opcionais: use `fmx agents setup --scope project` para contexto de sessão em Claude Code, Codex e OpenCode, ou instale a skill sob demanda com `npx skills add fluxomind/fmx --skill fmx` depois que esta branch estiver publicada. Só uma das opções já permite descobrir a CLI. `fmx agents status` inspeciona e `fmx agents remove` remove as entradas gerenciadas. O SDK de hooks também habilita o recurso hooks no config de usuário do Codex.

Para desenvolver: `npm ci`, `npm run build`, `npm test`, `npm run typecheck`. Testes usam Vitest; o servidor local e sua cadeia de build foram removidos.
