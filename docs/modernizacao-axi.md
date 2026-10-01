# Modernização do FMX · 0.4.0-alpha.1

> Registro da base inicial. As APIs de metadata e capacidades novas da versão 0.4.0-alpha.2 estão em [capacidades da plataforma](capacidades-plataforma.md).

O FMX é uma CLI de desenvolvimento e operação por terminal. O MCP remoto da plataforma é outra interface para os agentes. Ambos usam serviços da plataforma, mas a sessão OAuth do MCP pertence ao cliente MCP; a sessão da CLI pertence ao FMX.

## Stack encontrada e decisão

| Camada | Antes | Nesta versão | Motivo |
|---|---|---|---|
| Runtime | Node >=18 | Node >=22.12 | APIs nativas e compatibilidade com dependências ESM atuais |
| Linguagem/build | TypeScript → CommonJS, tsc | TypeScript 5.9, tsc, build limpa | Projeto pequeno; não precisa de empacotador nem de framework de servidor |
| Comandos | Commander 12 | Commander 15 | Parsing, rejeição de flags e erros de uso sem parser próprio |
| Testes | Jest 30 + ts-jest | Vitest 5 | Transformação TypeScript e mocks ESM, retirando a ponte ts-jest |
| Validação | Zod 4 | Zod 4 atualizado | Mantém validação dos manifests existentes |
| Watch | Chokidar 3 | Chokidar 4 | Menos dependências; exclusões migradas de globs para função |
| Interface | Texto e ANSI | TOON oficial + JSON, texto legado explícito | Saída compacta e consumível por agentes |
| Integração de sessão | Sem integração AXI | axi-sdk-js | Reutiliza instalação, reparo e remoção de hooks existentes |
| MCP local | SDK MCP + ncc + prom-client | Removido | Evita repetir ferramentas/autenticação que o servidor remoto já oferece |
| UI de terminal | Chalk e Ora declarados, sem uso | Removidos | Não manter dependências sem função |
| HTTP | fetch, refresh e retries próprios | Mantidos, idempotência corrigida | Preserva contratos da plataforma; chave única por operação, inclusive no retry |

CommonJS foi preservado para evitar misturar a modernização da interface com uma migração de todos os imports e caminhos de templates. Node >=22.12 permite carregar dependências ESM compatíveis. O `open` e os prompts continuam por compatibilidade com o login no navegador e o modo interativo explícito. TypeScript 5.9 foi mantido deliberadamente; atualizar uma versão principal não é um objetivo por si só.

## AXI aplicado

- Conversão na borda de saída com `@toon-format/toon`; JSON interno permanece JSON.
- `fmx` sem argumentos mostra executável, versão, diretório, endpoint, tenant e estado local de autenticação, sem tokens. Não faz consulta remota em todo início de sessão.
- `-v`, `-V` e `--version` usam um módulo isolado, sem carregar comandos ou credenciais. A versão vem de package.json.
- `metadata list` usa apiName,label,fieldCount por padrão; `metadata view` usa apiName,type,required; `query` usa id,name,api_name,status quando presentes. Campos são selecionados com `--fields` e texto completo com `--full`.
- Texto de campos selecionados acima de 1000 caracteres tem prévia e tamanho total. Listas incluem count; total é fornecido quando conhecido, ou null quando o backend não informa. Coleções vazias são explícitas.
- Progresso e diagnóstico vão para stderr. Resultados e erros estruturados vão para stdout. Flags/argumentos desconhecidos são rejeitados antes da ação; erros do parser incluem a referência do comando.
- Exit codes: 0 sucesso/no-op, 1 falha operacional, 2 uso inválido. Comandos antigos ainda podem classificar validações locais como falha operacional; não se declara conformidade AXI integral.
- `dev-env setup` exige `--ai-clients` ou `--interactive`. Repositório público exige `--public --force`. Login por dispositivo exige UUID, evitando tenant_mismatch com nomes como platform.
- Hooks só são instalados por `fmx agents setup`. Padrão: escopo project; `--scope user` é explícito. O SDK suporta Claude Code, Codex e OpenCode, com reparo de caminho e preservação de configurações alheias. O recurso hooks do Codex é habilitado no config de usuário pelo SDK mesmo em escopo project: revisar esse efeito antes de instalar.
- Skill estática em skills/fmx/SKILL.md, gerada da mesma orientação do home; build e CI verificam divergência. Ela é alternativa aos hooks para descoberta sob demanda.

Não foi acrescentada captura automática de transcrições no fim das sessões. O home ainda mostra contexto de conexão da CLI, não um inventário de trabalho específico do projeto. A CLI também não ganhou paridade com todas as ferramentas do MCP: consultas de metadata/registros foram adicionadas, mas workflows, agentes e outros recursos precisam de contratos HTTP próprios e testes antes de incorporar comandos.

## Build e instalação local

```sh
npm ci
npm run build
npm test
npm run typecheck
npm pack
npm install -g ./fluxomind-cli-0.4.0-alpha.1.tgz
fmx --version
```

Em máquinas com mais de um gerenciador Node/npm, use o prefixo da instalação desejada. Nesta máquina, o executável principal fica em /opt/homebrew/bin/fmx.

```sh
fmx
fmx --format json metadata list --limit 2
fmx query fm__object --limit 2 --fields id,name,api_name
fmx auth status
fmx agents status
```

## Compatibilidade e limites

`fmx mcp serve` e `fmx mcp --local` foram retirados. Configurações existentes precisam migrar para https://platform.fluxomind.com/api/mcp e completar OAuth no cliente. As configurações geradas não transferem tokens da CLI. Templates legados do Continue permanecem no formato JSON já usado pelo projeto; versões que exigem config.yaml devem migrar o preset separadamente.

`config get/list/set` só permite apiBaseUrl,defaultTenant,outputFormat. O bloco de autenticação existente permanece criptografado em ~/.fmx/config.json; não foi substituído por um keychain nesta mudança.

O HTTP 500 de metadata de campos observado na plataforma não é resolvido por esta atualização. A CLI mantém esse erro como falha do servidor. Os testes ao vivo usam apenas leituras e não validam deploys ou mutações em produção.

Referências: [AXI](https://github.com/kunchenguid/axi), [TOON](https://toonformat.dev/reference/spec), [Vitest](https://vitest.dev/guide/migration.html), [Chokidar](https://github.com/paulmillr/chokidar), [MCP no VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [MCP no Continue](https://docs.continue.dev/customize/deep-dives/mcp).

A rota de metadata lista objetos com limite padrão 200 e não retorna total. A CLI usa limit+1 e offset no servidor (limite de página até 499, respeitando o teto 500 do backend), apresenta total:null e calcula hasMore pelo registro adicional. Metadata de campos é limitada a 500 no backend; um resultado nesse teto não comprova o total.
