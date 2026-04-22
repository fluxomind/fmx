---
type: runbook
cycle: C
audience: external (tenant developer)
distribution: "@fluxomind/cli npm package (packages/cli/docs/first-dev-setup.md)"
target_time: "<30min"
last_reviewed: 2026-04-19
maintainer: Platform Engineering
---

# Fluxomind Developer Setup — Zero to First Deploy

> **Target:** 30 minutos em maquina zerada ate o primeiro `fmx deploy` bem-sucedido.
> **Para quem:** developer do tenant cliente da Fluxomind (desenvolvendo extensions no codeEngine).
> **Pre-requisito:** `@fluxomind/cli` instalado globalmente (`npm install -g @fluxomind/cli`).

Anote o horario agora. Ao terminar o passo 8, confirme: foi menos de 30 minutos? Se nao, abra issue com o passo lento.

---

## 1. Pre-requisitos

| Item | Como verificar | Obrigatorio? |
|------|----------------|--------------|
| Node.js >= 18 | `node -v` | **Sim** |
| npm | `npm -v` | **Sim** (vem com Node) |
| git | `git --version` | Recomendado (necessario para `fmx init --git`) |
| 1 AI client | VS Code + Copilot / Cursor / Claude Code / Continue + Ollama / Continue + Anthropic | **Sim** (1 dos 5) |
| Conta Fluxomind | credenciais do seu tenant | **Sim** |

## 2. Verificacao automatizada (opcional, recomendado)

Apos instalar o CLI (passo 3), rode:

```bash
bash $(npm root -g)/@fluxomind/cli/setup/bootstrap.sh
```

Detecta Node / npm / git / deno / ollama / fmx e emite warnings acionaveis. **Nao instala nada** — apenas diagnostica.

- Exit code `0` → todos os checks FATAL passaram
- Exit code `1` → pelo menos 1 check FATAL falhou; leia o output e instale o que falta

## 3. Instalar CLI

```bash
# Versão alpha publicada (latest ainda aponta para 0.2.0-alpha.1 — promover após stable)
npm install -g @fluxomind/cli@alpha
fmx --version
```

Se `fmx: command not found`, cheque o PATH: `echo $(npm prefix -g)/bin` precisa estar em `$PATH` (veja troubleshooting §10).

## 4. Autenticar

```bash
fmx auth login
```

Um navegador abre automaticamente. Complete o OAuth. Token fica encriptado em `~/.fmx/config.json` (AES-256-GCM). Confirme:

```bash
fmx auth status
# → Authenticated as <seu-email>  tenant: <seu-tenant>
```

Se o navegador nao abriu ou porta 3000 esta ocupada, use `fmx auth login --port 8080`.

## 5. Scaffold primeira extension

```bash
fmx init minha-extension --git
cd minha-extension
```

Gera estrutura segura:

```
minha-extension/
├── .git/
├── .github/
│   └── workflows/ci.yml deploy.yml
├── .gitignore              # robusto (ignora .env*, ~/.fmx/, logs, coverage)
├── fluxomind.extension.toml
├── package.json
├── src/{triggers,pages,components,connectors}/
├── tests/
└── README.md
```

Repo remoto e criado **no seu GitHub** (ou conectado via `--git link <url>`). Fluxomind nao tem acesso ao seu codigo-fonte.

## 6. Configurar AI client (1 dos 5)

Todos os templates ja vivem dentro do pacote `@fluxomind/cli`. Escolha uma opcao abaixo e copie:

### Opcao A — VS Code + GitHub Copilot

```bash
mkdir -p .vscode
cp $(npm root -g)/@fluxomind/cli/setup/configs/vscode/mcp.json .vscode/
cp $(npm root -g)/@fluxomind/cli/setup/configs/vscode/settings.json .vscode/
cp $(npm root -g)/@fluxomind/cli/setup/configs/vscode/extensions.json .vscode/
```

Abra VS Code na pasta; aceite as extensoes recomendadas. Copilot Chat detecta MCP Fluxomind automaticamente.

### Opcao B — VS Code + Continue + Ollama (privacidade: 100% local)

Pre-req: instalar Ollama ([ollama.com](https://ollama.com/)).

```bash
ollama pull qwen2.5-coder:7b
ollama serve &              # em outro terminal ou via launchd/systemd
mkdir -p .continue
cp $(npm root -g)/@fluxomind/cli/setup/configs/continue-ollama/config.json .continue/
```

Abra VS Code → Continue.dev inicia → chat conectado a Ollama local + MCP Fluxomind.

### Opcao C — Claude Code CLI

Pre-req: Claude Max subscription ou API key Anthropic.

```bash
mkdir -p .claude
cp $(npm root -g)/@fluxomind/cli/setup/configs/claude-code/settings.json .claude/
```

Rode `claude` no terminal. Claude Code detecta MCP Fluxomind; use `/list-mcp-tools` para ver as 6 tools.

### Opcao D — Cursor

```bash
mkdir -p .cursor
cp $(npm root -g)/@fluxomind/cli/setup/configs/cursor/mcp.json .cursor/
```

Cursor reconhece `mcpServers.fluxomind` ao abrir a pasta.

### Opcao E — VS Code + Continue + Anthropic API

```bash
export ANTHROPIC_API_KEY=sk-ant-...
mkdir -p .continue
cp $(npm root -g)/@fluxomind/cli/setup/configs/continue-anthropic/config.json .continue/
```

API key e resolvida **por env var** — nunca escrita no arquivo `config.json`.

## 7. Validar MCP local

```bash
fmx mcp serve &
# em outro terminal — valide que o AI client ve as tools:
#   Copilot Chat: "/list-mcp-tools" ou "@fluxomind tools"
#   Claude Code:  "/list-mcp-tools"
#   Continue:     menu "Tools" → "fluxomind"
```

Deve listar 6 tools: `codeengine_metadata`, `codeengine_query`, `codeengine_scaffold`, `codeengine_deploy`, `codeengine_test`, `codeengine_logs`.

## 8. Primeiro deploy

```bash
fmx deploy
```

Output esperado:

```
✓ Deployed: minha-extension v0.0.1 em 3.2s
  URL: https://<seu-tenant>.fluxomind.dev/ext/minha-extension
```

Se der erro `manifest invalid`, rode `fmx validate` (disponivel pos-EVO-394) para diagnostico.

## 9. Dev loop

```bash
fmx dev              # watch mode: cada save deploya
```

Em outro terminal:

```bash
fmx logs --tail
```

Voce ve cada deploy + logs em tempo real.

## 10. Troubleshooting

| Sintoma | Causa provavel | Correcao |
|---------|----------------|----------|
| `fmx: command not found` | npm global prefix fora do PATH | `export PATH="$(npm prefix -g)/bin:$PATH"` no `.zshrc` / `.bashrc` |
| `fmx auth login` abre mas trava | Porta 3000 ocupada | `fmx auth login --port 8080` |
| AI client nao lista tools `fluxomind` | `fmx` nao esta no PATH do processo que spawna MCP | Use path absoluto em `command:` (ex: `"/usr/local/bin/fmx"`) ou reinicie o AI client apos ajustar o PATH global |
| Ollama responde 404 | modelo nao baixado | `ollama pull qwen2.5-coder:7b` |
| `fmx deploy` falha com `manifest invalid` | TOML mal-formado | Abra `fluxomind.extension.toml` + `fmx validate` (pos-EVO-394) |
| `npm install` bloqueado por proxy corporativo | proxy nao configurado | `npm config set proxy $HTTP_PROXY && npm config set https-proxy $HTTPS_PROXY` |
| Claude Code pede subscription Max | conta sem plano Max | Use Opcao E (Continue + Anthropic API key) |
| Ollama consome toda RAM | modelo muito grande | Troque para `qwen2.5-coder:1.5b` ou ajuste `OLLAMA_NUM_CTX=4096` |
| Token expira apos 1h | expirado e nao refresh | Refresh automatico via `fmx`; se persistir, `fmx auth login` |
| `fmx auth status` diz `not authenticated` apos restart | `~/.fmx/config.json` corrompido | `rm ~/.fmx/config.json && fmx auth login` |
| `git push` rejected | repo existe mas sem commits | `git push -u origin main` ou consulte `fmx init --help` para `--git link` |

## 11. Proximos passos

- **Wizard automatizado** — `fmx dev-env setup` (EVO-390, Wave 2). Substitui passos 2, 6 e 7 por uma unica invocacao interativa.
- **VS Code Extension** — `fluxomind.fmcode` no Marketplace (EVO-391, Wave 3). Ganha autocomplete `fm.*`, diagnostics inline, painel de logs.
- **Comunidade** — `docs.fluxomind.dev/community` (TBD — futura EVO docs publicas).
- **Paridade CLI ↔ playbook** — `fmx validate` + sync de nomenclatura (EVO-394, Wave 2).

---

**Problemas ou duvidas?** Abra issue em [github.com/fluxomind/fmx/issues](https://github.com/fluxomind/fmx/issues) com label `onboarding` (o monorepo interno da plataforma não recebe issues públicas).
