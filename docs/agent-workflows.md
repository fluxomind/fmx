# FMX para agentes — 0.4.0-alpha.3

Esta versão reduz a descoberta manual e permite validar definições antes de escrever. Os comandos novos foram verificados contra um servidor HTTP simulado, com contratos conferidos no source da plataforma. A primeira validação foi inteiramente local. Após autorização explícita, foram feitas consultas autenticadas de metadados, conexões e jobs e um dry run de criação de app (somente GET para conferir namespace). Nenhum recurso foi criado, alterado ou removido no tenant. As rotas apps list/get/templates retornaram 403 nesta sessão; não foram declaradas como validadas em produção.

## Descoberta e contexto

```bash
fmx catalog workflow run
fmx catalog agent --full
fmx workflow schema --format json
fmx doctor
fmx context show
fmx context init --tenant <tenant-uuid> --environment test
```

`catalog` deriva argumentos e flags do Commander, sem tabela paralela. `workflow schema` publica o JSON Schema da estrutura canônica. Não descrevem permissões dinâmicas nem garantem disponibilidade do servidor.

`context init` grava apenas tenant e ambiente em `.fmx/project.json`, recusa sobrescrita e não armazena credenciais. O contexto mais próximo do cwd prevalece sobre o tenant global; `--tenant` explícito prevalece sobre o projeto. Uma configuração malformada falha, sem mudar silenciosamente de tenant. O ambiente é informativo; não bloqueia produção. A origem da API continua seguindo `--api-url` (nos comandos que oferecem a flag), `FLUXOMIND_API_URL` e a configuração global. Com `FLUXOMIND_ACCESS_TOKEN`, o tenant vem do token e é autorizado pelo servidor; a configuração local não troca esse tenant.

`doctor` é local por padrão. `--remote` faz uma consulta GET à saúde da plataforma; `--object <nome>` acrescenta uma consulta de um registro para testar leitura. Saúde global não equivale a saúde da fila, nem comprova permissão para escrever.

## Workflows

```bash
fmx workflow validate --file workflow.json
fmx workflow validate --file workflow.json --remote
fmx workflow create --file workflow.json
fmx workflow run <definition-id> --trigger '{"request":{"mensagem":"Teste"}}' --wait --timeout 60000
fmx workflow runs get <run-id> --full
fmx workflow export <definition-id> --out workflow.json
fmx workflow diff <definition-id> --file workflow.json
```

- A validação padrão é offline: tipos básicos, IDs duplicados, referências de arestas, mapping completo, trigger/action obrigatórios, fonte do Code node e condição de branch. Não executa código nem comprova tipo/ordem/disponibilidade dos outputs. Outras configurações de nós continuam dependentes do servidor.
- `--remote` somente lê os schemas de ações para conferir entradas obrigatórias. A validação de publicação/execução no servidor permanece obrigatória.
- `create` devolve identidade e estado compactos; `--full` devolve o registro inteiro.
- `run --wait` inicia uma única execução e consulta o mesmo ID. `waiting` é pausa, não conclusão. Falha, cancelamento e timeout retornam exit 1. O timeout não cancela nem repete o run. `--full` evita truncamento de texto.
- `export` grava o payload de criação completo, sem sobrescrever arquivo existente. Não exporta credenciais, agentes ou recursos referenciados.
- `diff` compara somente a definição, ignora `id`/`version` e informa campos diferentes. Não aplica mudanças e não indica drift de dependências. Arrays mantêm a ordem porque ela pode ser relevante à execução.
- `workflow runs` usa `workflow_definition_id`, conforme o esquema observado no tenant.

## Erros e efeitos parciais

Os erros têm código estável da CLI ou do servidor e orientação específica quando reconhecida. Conflitos, permissão negada, rate limit e fila saturada são distinguidos.

O endpoint de execução pode criar um run e depois falhar ao admitir o job, sem devolver seu ID no erro. FMX informa `operationState: unknown`, orienta consultar os runs e não repete automaticamente a mutação. Ele não pode recuperar um ID que a API não forneceu com segurança.

A exclusão de um workflow publicado pode falhar por versões vinculadas. FMX não apaga as dependências para contornar a recusa: isso exige uma operação transacional na plataforma. Um 404 na exclusão é reconhecido como estado já ausente.

A chave de idempotência por requisição não prova deduplicação no backend. A versão não promete idempotência entre duas invocações independentes. Nenhum comando aplica correções em segundo plano.

## Ampliação da plataforma

| Comando | Contrato | Limite |
|---|---|---|
| `model create-object` | POST `/api/services/modelling/objects` | name/api_name obrigatórios; somente campos aceitos pela rota |
| `model create-field <object>` | POST `/api/services/modelling/objects/:object/fields/create` | apiName/displayName obrigatórios; relações exigem parentObjectApiName |
| `apps create` | Gateway DataEngine para fm__application, mesma entidade usada pelo executor create_app | Cria a identidade do app; --dry-run é offline; --remote apenas consulta namespace |
| `apps list/get` | Catálogo de apps e manifest projetado por role | Consulta; retornou 403 no teste real desta sessão |
| `connections list/create` | APIs do Workflow Studio | Output nunca inclui campos de credencial; use arquivo/stdin para enviar segredos |
| `jobs list/get` | Gateway QueueEngine | Consulta; total desconhecido, lookahead e continuação |
| `agent models list/assign` | API Agent Studio | Assignment via modelCatalogId e role/slotKey; gates do servidor preservados |
| `agent knowledge list/link` | API Agent Studio | Vincula bases existentes; não ingere documentos |

Exemplos de payloads:

```json
{"name":"Demo","api_name":"demo__request","display_name":"Solicitação"}
```

```json
{"apiName":"title","displayName":"Título","dataType":"STRING","isRequired":true}
```

```json
{"assignment":{"modelCatalogId":"<model-id>","role":"COMPLETION"}}
```

```json
{"knowledgeIds":["<knowledge-id>"]}
```

## Limites restantes

Composição de páginas, menus e membros de apps, gestão completa de ferramentas de agentes, alteração/remoção de modelagem, aprovação/retomada de atendimento humano e controle de jobs ainda requerem contratos adicionais. A API de readiness do agente exige tenantId numérico e persiste score; não foi promovida como diagnóstico de leitura. Nenhuma dessas lacunas foi encoberta com CRUD direto nas tabelas internas.

Os exemplos da skill são gerados com a versão exata do package.json, evitando executar o `latest` antigo. Essa versão precisa estar publicada antes de os exemplos npx funcionarem; no source, use `node dist/bin.js`.

## Criação de app e dry run

```bash
node dist/bin.js apps schema --format json
node dist/bin.js apps create --file templates/apps/app.json --dry-run
node dist/bin.js apps create --file templates/apps/app.json --dry-run --remote
# Escrita explícita: somente com autorização no tenant de destino
node dist/bin.js apps create --file templates/apps/app.json
```

`name` e `namespace` são obrigatórios; namespace é explícito para não duplicar a lógica de geração de slug do servidor. `status` padrão é `draft`. Identidades/auditoria são injetadas pela plataforma; o payload rejeita tenant_id, IDs e outros campos não permitidos. `colorTheme` é mapeado para `color_theme`.

O dry run local valida e mostra o request, sem autenticação ou HTTP. O remoto só consulta o namespace pela API DataEngine e declara que não verificou permissão de escrita. A rota de criação não tem preview nativo: esta é uma simulação do FMX, nunca uma escrita seguida de rollback.

Na execução, o mesmo namespace já encontrado devolve o registro existente sem mudar nome/status. A checagem não é atômica e não garante ausência de duplicatas sob concorrência; nenhuma mutação é repetida automaticamente. Não replica o pipeline de governança do ToolRegistry nem cria páginas, menus ou membros implicitamente. A API DataEngine continua responsável por ACL/RLS e validação.

## Apps completos a partir de templates

```bash
fmx apps templates
fmx apps create --template <template-id> --dry-run
# Escrita explícita: instancia o app e os membros pelo serviço governado
fmx apps create --template <template-id>
```

A instanciação usa POST `/api/services/app/templates`: o serviço da plataforma cria o app e seus membros/objetos/canais, com os mesmos executores governados usados pelo MCP. O CLI não replica essa orquestração. Templates publicados determinam quais recursos serão criados ou referenciados. O dry run é um preview local da solicitação; --remote consulta o catálogo, mas não executa a instanciação. A rota retornou 403 no tenant desta sessão, portanto a execução foi testada apenas com o servidor simulado.

## Preview global de escritas

```bash
fmx --dry-run workflow run <id>
fmx --dry-run model create-object --file object.json
fmx --dry-run connections create --file connection.json
```

O preview global dos comandos de plataforma intercepta POST/PUT/PATCH/DELETE no cliente HTTP antes de autenticação e envio, imprime a solicitação com campos de segredo mascarados e encerra a execução com exit 0. Ele para na primeira escrita; não promete simular todos os efeitos de uma operação composta. Consultas GET anteriores podem ocorrer. Autenticação, dev/deploy legados e configuração local não oferecem essa garantia e recusam a flag. `apps create --dry-run` tem preview próprio inteiramente local, salvo --remote explícito.
