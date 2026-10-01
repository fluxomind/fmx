# FMX e capacidades da plataforma · 0.4.0-alpha.2

A CLI usa APIs da plataforma com a sessão do FMX. Não inclui nem inicia um servidor MCP. O MCP remoto continua em https://platform.fluxomind.com/api/mcp, com autenticação própria no harness.

## Capacidades adicionadas

| Comandos | Capacidade e contrato do servidor |
|---|---|
| records list/get/create/update/delete | CRUD genérico via /api/v1/dataEngine; tenant e permissões vêm da sessão |
| records update --expected | Compare-and-swap: expectedValues preservado; conflito 409 com campos divergentes |
| records batch create/update/upsert/remove | APIs batch do DataEngine, payload JSON por arquivo/stdin/flag; falhas parciais preservadas, exit 1 |
| records aggregate | COUNT, SUM, AVG, MIN, MAX, MEDIAN, COUNT_DISTINCT, COUNT_NULL, COUNT_NOT_NULL, percentuais e RANGE |
| metadata list --prefix / metadata view | APIs /api/v1/metadata/objects e /fields; rota de campos validada em produção |
| agent list/get/create/update/delete | Configuração de agentes em fm__agent via DataEngine |
| agent export/import | Formato portátil oficial da plataforma; JSON de exportação sem truncamento, arquivo opcional com modo 0600 |
| agent invoke | Execução síncrona via /api/agents/:id/runs/invoke, messages e config mantidos no payload |
| workflow list/get/create/update/delete | Definições e rascunhos; criação exige name e type |
| workflow publish/versions/rollback | Publicação com snapshot imutável; rollback cria uma nova versão |
| workflow run/runs/events/cancel/lifecycle | Execução validada pelo servidor, registros de execução, timeline, cancelamento e ciclo de vida |
| workflow templates/clone | Descoberta de templates e clonagem para um rascunho |
| workflow actions list/schema | Catálogo real e schemas dos conectores; ações repetidas pelo servidor são deduplicadas por nome |
| api METHOD /api/path | Acesso JSON autenticado a outras APIs; valida caminho relativo antes de enviar credenciais |

`agent` administra agentes da plataforma. `agents` mantém os comandos de integração AXI com harnesses (setup/status/remove), para preservar a interface da versão anterior.

## Exemplos

```sh
fmx records list fm__agent --fields id,name,is_active --limit 20
fmx records list fm__object --filters '{"api_name":{"operator":"eq","value":"fm__agent"}}'
fmx records get <object> <record-id> --full
fmx records create <object> --file record.json
fmx records update <object> <record-id> --data '{"status":"active"}' --expected '{"status":"draft"}'
fmx records batch upsert <object> --file rows.json --match-field external_id
fmx records batch update <object> --file updates.json --continue-on-error
fmx records aggregate <object> COUNT id

fmx metadata list --prefix fm__agent --limit 20
fmx metadata view fm__agent
fmx agent export <agent-id> --out agent.json
fmx agent import --file agent.json --mode create --name '<new-name>'
fmx agent invoke <agent-id> --file messages.json

fmx workflow actions list
fmx workflow actions schema data.findRecords
fmx workflow create --file workflow.json
fmx workflow publish <definition-id>
fmx workflow versions <definition-id>
fmx workflow run <definition-id> --trigger '{"source":"cli"}'
fmx workflow events <run-id>
fmx workflow rollback <definition-id> <version-id>

fmx api GET /api/v1/openapi.json --format json
```

Payload de `workflow create` segue a plataforma, por exemplo:

```json
{"name":"Demo","type":"custom","definition":{"nodes":[],"edges":[]}}
```

Esse exemplo é um rascunho vazio. Publicar/executar exige o contrato de ações válido; não é um workflow pronto.

Payload de `agent invoke`:

```json
{"messages":[{"role":"user","content":"<message>"}],"config":{"thread_id":"<thread-id>"}}
```

JSON de batch update usa `{id,data}` por item. Batch remove recebe IDs. `--data` e `--file` são mutuamente exclusivos; `--file -` lê stdin. Escrita condicional não existe em batch: use `records update --expected`, registro por registro. O teto absoluto de create/upsert/remove é 10000, mas limites do tenant e o teto 200 de update podem recusar lotes menores; a CLI não divide automaticamente uma operação em várias transações.

## Autenticação e automação

A sessão salva por `fmx auth login` permanece utilizável. `--tenant` seleciona credenciais salvas, não substitui a identidade de um token.

Para CI há `FLUXOMIND_ACCESS_TOKEN`: token Bearer de sessão aceito pelas APIs da plataforma, mantido no ambiente. Quando presente, ele tem precedência sobre as credenciais salvas e não passa pelo refresh local. Seu tenant vem do token; `--tenant` não muda isso. Essa variável não converte um token OAuth MCP em uma sessão FMX. `FLUXOMIND_API_URL` seleciona o endpoint.

Não há prompts nos comandos novos. Saída padrão TOON ou `--format json`. Flags inválidas retornam 2; falhas operacionais ou parciais retornam 1. Erros HTTP preservam status, código e detalhes estruturados (como conflitos de baseline). POST/PUT/PATCH/DELETE não são repetidos após erro transitório: uma chave de idempotência não comprova deduplicação no servidor. Uma rejeição 401 pode renovar a sessão salva e repetir uma vez.

## Paginação e saída

`records list`, `agent list` e `workflow list/runs` consultam limit+1 no servidor, ordenando por id por padrão. `--fields`, `--filters` e `--order-by` são enviados ao servidor. A continuação é `{command,args}`, preservando os parâmetros e sem interpolação de shell.

DataEngine pode devolver totalRecords=data.length quando COUNT não executou. A CLI só o apresenta como total quando rowLimit.exact é true; caso contrário, total:null. Limites efetivos do tenant são sinalizados, e hasMore:null significa que um teto impede concluir se há outra página. Capabilities só aparecem com --capabilities e são restritas aos IDs da página exibida.

A API de campos limita a resposta a 200 campos. Metadata view informa sourceLimit:200; nesse teto o total é desconhecido. A versão anterior usava a rota code-engine de campos, que retornava 500. A API v1 de campos funcionou no teste real. Metadata list não exibe mais fieldCount:0, que era um placeholder do servidor, não uma contagem calculada.

Textos de detalhe são prévias de até 1000 caracteres com tamanho original; --full devolve o texto completo. Exportação portátil de agentes sempre mantém o JSON completo. O backend exporta as seções agent,knowledge,modelConfig; não se promete exportar workers, todas as tools ou credenciais que a rota não devolve.

## Provas e cobertura real

Os testes de contrato executam o binário compilado contra um servidor HTTP local, com token sintético. Verificam método, rota, envelopes, filtros/campos, baseline, falha 207, códigos de saída, arquivo portátil sem truncamento e ausência de retries de mutação.

No tenant autenticado foram validadas leituras de registros e agentes, metadata de objetos/campos, catálogo de ações e schema de data.findRecords, templates/definições e exportação de configuração de um agente. Posteriormente foram criados e publicados dois workflows de demonstração, depois excluídos a pedido do usuário. A execução foi recusada pela fila com queue_age_exceeded; isso não comprova execução completa dos nós.

Essa versão amplia a CLI de fato, mas não declara paridade integral com o MCP. `/api/v1/tools` usa um catálogo de exemplo (calculator/echo), então não foi usado como ponte para a ToolRegistry real. Modelagem especial de objetos, composição de páginas/apps, governança e integrações ainda precisam de comandos próprios e contratos validados. `api` permite usar APIs JSON existentes com autenticação, mas não cria endpoints nem garante compatibilidade com todas as ferramentas MCP. A rota enriched schema também retornou 500 no teste real e não foi promovida como um comando funcional.

A versão 0.4.0-alpha.3 acrescenta controles para agentes e comandos adicionais. Consulte [contratos e limites da versão](agent-workflows.md). Nesta etapa, toda validação foi local; nenhuma chamada ao tenant de produção.
