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

Integrações opcionais: use `fmx agents setup --scope project` para contexto de sessão em Claude Code, Codex e OpenCode, ou instale a [skill sob demanda](skills/fmx/SKILL.md) com `npx skills add fluxomind/fmx --skill fmx`. Só uma das opções já permite descobrir a CLI; elas também podem ser usadas juntas. `fmx agents status` inspeciona e `fmx agents remove` remove as entradas gerenciadas. O SDK de hooks também habilita o recurso hooks no config de usuário do Codex. Hooks e contexto vivo exigem opt-in; carregar a skill não instala integrações.

A skill usa descoberta progressiva: [contexto e autenticação](skills/fmx/references/context.md), [operações e verificação](skills/fmx/references/operations.md) e [todas as funcionalidades da CLI](skills/fmx/references/commands.md), separadas por grupo de comandos. O catálogo de referências inclui argumentos, flags/defaults e os contratos/schemas disponíveis na versão do pacote; não afirma que todos os comandos tenham schema de payload ou que a sessão tenha todas as permissões.

Para manter a skill, edite `scripts/skill-template.md` e as referências de contexto/operações. Execute `npm run build:cli && npm run skill:generate` após alterar a versão ou os comandos. `scripts/generate-skill.cjs` gera a entrada, os exemplos compartilhados com a home e as referências de cada grupo diretamente de `fmx catalog --full`, sem chamadas remotas. `npm run skill:check`, incluído no build/CI, detecta referências geradas desatualizadas.

Para desenvolver: `npm ci`, `npm run build`, `npm test`, `npm run typecheck`. Testes usam Vitest; o servidor local e sua cadeia de build foram removidos.

## Capacidades da plataforma · 0.4.0-alpha.2

Além das extensions, o FMX agora administra registros, agentes e workflows com as APIs reais da plataforma:

```sh
fmx records list fm__agent --fields id,name,is_active
fmx metadata view fm__agent
fmx agent export <id> --out agent.json
fmx workflow actions list
fmx workflow create --file workflow.json
fmx workflow publish <id>
fmx workflow run <id> --trigger '{"source":"cli"}'
fmx api GET /api/v1/openapi.json --format json
```

CRUD, batches, agregações, atualização condicional, configuração portátil de agentes, versões e execução de workflows estão documentados em [capacidades e contratos](docs/capacidades-plataforma.md). Use `agent` para agentes da plataforma; `agents` continua dedicado aos hooks AXI. Arquivos e stdin são aceitos com `--file <path|->`.

Para CI, `FLUXOMIND_ACCESS_TOKEN` pode fornecer um token Bearer de sessão aceito pela API, sem armazená-lo ou imprimi-lo. Ele prevalece sobre a sessão salva e não faz refresh. A CLI não presume que tokens MCP e FMX sejam intercambiáveis.

### Controles para agentes (0.4.0-alpha.3)

Validação offline de workflows, catálogo de comandos, espera de execuções, exportação/diff e contexto por workspace. Novos comandos para objetos/campos, modelos/conhecimento de agentes, apps, conexões e jobs. Veja [contratos, exemplos e limites](docs/agent-workflows.md).

```bash
fmx catalog workflow run
fmx workflow validate --file workflow.json
fmx workflow run <id> --wait --timeout 60000
fmx apps create --file templates/apps/app.json --dry-run
fmx apps create --template <template-id> --dry-run
fmx --dry-run workflow run <id>
fmx doctor
```

## Agentes e plataforma — 0.4.0-alpha.4

Use `fmx dashboard` para contexto vivo e `fmx access` para capabilities fornecidas pelo servidor. Os novos contratos de escrita aparecem em `fmx catalog <comando>` com schema e efeitos. `--read-only` ou `FMX_READ_ONLY=1` bloqueia requests diferentes de GET nos comandos de plataforma; `--dry-run` permite previews sem envio.

A versão acrescenta componentes de páginas, workers, allowlists de ferramentas, conhecimento, aprovações/HITL, schedules e controle/observação de jobs. `resources validate/plan/apply` oferece planos de campos de registros, updates condicionais e resultados parciais explícitos. O dry run não comprova autorização de escrita.

[Contratos, exemplos, provas e limites](docs/agent-platform.md). No checkout, `npm run test:live` executa smoke checks autenticados com o guard de leitura, sem criar recursos no tenant.
