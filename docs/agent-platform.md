# FMX para agentes — 0.4.0-alpha.4

Esta versão amplia os contratos de domínio e o planejamento de mudanças. As escritas foram verificadas com fixtures HTTP locais. No tenant autenticado, os testes usaram consultas e dry runs; nenhum recurso foi criado, alterado, removido, aprovado ou executado.

## Leitura e previews

```sh
FMX_READ_ONLY=1 fmx dashboard
fmx --read-only access object <object>
fmx --read-only access record <object> <id>
fmx --read-only --dry-run jobs retry <id>
```

`--read-only` e `FMX_READ_ONLY=1` permitem somente GET no cliente HTTP dos comandos de plataforma. POSTs usados para consultas, como agregações legadas, também ficam bloqueados. Comandos legados com caminhos de rede separados e autenticação/configuração local recusam esse modo. A renovação da autenticação é separada: não se promete ausência de chamadas OAuth, e sim ausência de escritas de recursos pelos comandos testados. O dry run tem precedência e permite visualizar uma escrita sem enviá-la. Esta é uma proteção do cliente, não uma permissão ou sandbox fornecida pelo servidor.

`access` apresenta as capabilities recebidas do DataEngine. A amostra de um registro não comprova permissão global nem criação. O servidor verifica as regras novamente ao executar; a CLI não eleva a identidade. Campos de identidade/auditoria continuam proibidos nos manifests, mesmo se uma projeção de capabilities os listar como graváveis.

## Catálogo e contexto

```sh
fmx catalog apps components create --format json
fmx catalog policy decide --format json
fmx dashboard --tenant <uuid>
fmx dashboard --app <uuid>
```

Os novos comandos de escrita declaram endpoint, método, efeitos e JSON Schema de entrada no catálogo. O mesmo Zod valida o payload em execução; a conversão do schema ocorre sob demanda. Algumas regras semânticas, como update não vazio, não são representadas integralmente pelo JSON Schema. Comandos anteriores mantêm seus argumentos/flags e schemas próprios quando disponíveis; o catálogo não promete schemas para todos os payloads antigos.

O dashboard consulta até três workflows, agentes e jobs, com uma entrada extra para lookahead. Uma recusa numa seção permanece visível, preservando as demais e retornando exit 1 por resultado parcial. Um app explícito acrescenta seu resumo projetado por role.

`context init --tenant <uuid> --environment test --app <uuid> --live-context` permite optar por contexto vivo ao executar `fmx` sem argumentos, inclusive em uma integração de sessão instalada pelo usuário. Sem essa opção, a tela inicial continua local. Nenhum hook ou arquivo de projeto foi instalado automaticamente nesta entrega.

Listas novas de workers, conhecimento disponível, ferramentas e decisões usam janela curta, `--fields`, `--full` e continuação estruturada. Algumas APIs devolvem uma lista com teto e não oferecem paginação; nesses casos, `paginationScope: returned-source-window` explicita que o offset é local à resposta recebida. `sourceCount` não é um total global e `sourceComplete: unknown` não afirma que o catálogo está completo.

## Contratos acrescentados

| Comandos | Serviço usado | Escopo |
|---|---|---|
| `apps summary/home` | AppEngine | Contagens, atividade e estado do app projetados por role |
| `apps components tree/create/update/delete` | AppEngine page-component | Componentes de páginas existentes; update aceita `version`; delete remove descendentes |
| `agent workers list/available/link/update/unlink` | Agent Studio | Vínculos de delegação; remover vínculo preserva o worker |
| `agent tools list/get/set` | Agent Studio | Catálogo e allowlist; set substitui a lista e usa a validação de compatibilidade com modelo do servidor |
| `agent knowledge available/unlink` | Agent Studio | Descoberta e remoção de vínculo; não remove documentos |
| `knowledge list/status/ingest` | DataEngine e retrieval | Ingestão de texto em base existente; o status armazenado não prova que todos os chunks/embeddings estão prontos |
| `workflow approvals list/approve/reject/recall/delegate` | Workflow Engine | Tarefas de aprovação, com autorização do serviço |
| `policy pending/decide` | AppEngine e Policy Engine | Decisões pessoais de HITL: approve, reject, abort e adjust |
| `jobs cancel/retry/reschedule/wait/types` | QueueEngine | Controle auditado, catálogo e observação por GET |
| `jobs schedules list/get/create/update/pause/resume/run-now/archive` | QueueEngine | Agendamentos, recorrência explícita e gates do servidor |
| `model update-object/update-field/retire-object/retire-field/restore-field` | Modelling e lifecycle | Renomeação e aposentadoria governadas; retire pode agendar purge futuro |

Payloads usam `--file`, `--data` ou `--file -`. `knowledge ingest` aceita somente `text`: a rota atual ignora opções de chunking/masking/embedding mesmo quando presentes no schema do backend; a CLI não anuncia essas opções como funcionais. A base deve existir, e a sessão/flag/contexto deve fornecer tenant UUID. O servidor compara o tenant do payload com a sessão.

Workers têm IDs distintos para o agente delegado e seu vínculo. `link` recebe `workerId`; `update` e `unlink` recebem `bindingId`. Bases de conhecimento usam `junctionId` no unlink. A CLI não apaga os recursos referenciados para contornar erros de dependência.

As respostas de modelagem `202 {held:true,...}` são apresentadas como `outcome: held, completed:false`: a mudança aguarda decisão. A decisão de política pode disparar retomada durável no backend, mas a resposta não confirma essa retomada. `requestedDecision`, `status` canônico e `resumption: not-reported` evitam afirmar que uma execução já voltou a funcionar. Nenhuma aprovação foi enviada ao tenant nos testes.

`jobs wait` observa um job existente, com timeout limitado e sem retries HTTP ocultos. Falha, cancelamento, timeout e erro de observação retornam exit 1, preservando o ID. Observar não cancela, retoma nem reinicia o trabalho. Falhas HTTP preservam status e requestId; o mesmo ID é enviado como correlação nas tentativas de uma requisição.

## Registros declarativos

```sh
fmx resources schema --format json
fmx resources validate --file manifest.json
fmx --read-only resources plan --file manifest.json --remote --out plan.json
fmx --read-only --dry-run resources apply --file plan.json
```

```json
{
  "apiVersion": "fmx/v1",
  "apiOrigin": "https://platform.fluxomind.com",
  "tenant": "00000000-0000-7000-8000-000000000001",
  "resources": [
    {
      "key": "request-demo",
      "object": "demo__request",
      "match": {"external_id": "demo-request-1"},
      "data": {"external_id": "demo-request-1", "title": "Demonstração"}
    }
  ]
}
```

O tenant do exemplo é fictício. Cada recurso usa exatamente `id` ou `match`, e declara somente os campos que pretende gerenciar. Match aceita igualdade sobre valores escalares. IDs, tenant, auditoria, propriedades de protótipo e chaves de credenciais não entram no payload portátil.

`validate` é offline. `plan` é offline por padrão; `--remote` consulta campos e registros por GET. O catálogo de campos é reaproveitado por objeto durante a chamada. Um catálogo no teto, campo desconhecido, identidade ambígua ou baseline não legível impede produzir um plano executável. Recursos diferentes não podem gerenciar o mesmo registro. Um ID ausente gera erro, nunca criação automática; criação exige match explícito. Não há resolução de referências entre recursos nem remoção automática.

O plano registra origem da API, tenant, digest do manifesto, create/update/noop e baseline. A origem e o tenant ativo precisam concordar; um tenant diferente exige seleção explícita e ainda precisa coincidir com o arquivo. Tokens de ambiente precisam carregar o mesmo tenant no JWT para essa checagem local de roteamento; ela não substitui a verificação criptográfica feita pelo servidor. Tokens opacos não são aceitos nesse fluxo declarativo.

O arquivo é completo, modo 0600, sem sobrescrever; a saída padrão mostra apenas ações e nomes de campos. `--full` permite inspecionar valores e baselines. Os arquivos podem conter dados do cliente: devem ficar fora do git e não são uploadados automaticamente.

`apply --dry-run` valida e resume o plano sem HTTP, deixando explícito que o estado remoto não foi reconferido. A execução real, quando autorizada em outro contexto, reconfere todos os baselines antes da primeira escrita e usa `expectedValues` nos updates. Conflito posterior ainda pode produzir sucesso parcial; nesse caso, a CLI preserva resultados/IDs, status, detalhes e correlação, interrompe os recursos restantes e orienta reconciliação. Não há rollback ou retomada automática. Consultas e updates condicionais não tornam um conjunto de operações uma transação.

Criações continuam baseadas em lookup, sem garantia atômica de unicidade. Uma falha após envio pode ter efeito desconhecido, e não é repetida. Escritas declarativas em objetos `fm_`/`fm__` são recusadas: configuração de recursos da plataforma pertence aos comandos de domínio, não a esse reconciliador de registros.

## Provas e limites

`npm run test:live`, no checkout do source, executa uma bateria explícita com `FMX_READ_ONLY=1`. O relatório contém comandos, códigos, duração e contagens, sem copiar registros, IDs ou tokens. Uma permissão negada aparece como `denied`, não como execução bem-sucedida da funcionalidade; falhas inesperadas retornam exit 1.

No teste desta entrega funcionaram consultas de metadados, capabilities, tipos de jobs, schedules, conhecimento e status, catálogo de ferramentas, workers, conhecimento disponível, tarefas de aprovação e dashboard. Apps/catalog/templates, componentes de páginas e a fila pessoal de decisões receberam `403`. Um registro existente foi comparado num plano `noop`, seguido de dry run local da aplicação. Os artefatos temporários foram removidos. Nenhuma escrita de recurso foi enviada.

Fixtures HTTP verificam escrita, recusa, conflito, falha parcial, timeout e não repetição de mutações. Isso não substitui uma homologação com múltiplos usuários e escritas em tenant descartável.

Ainda dependem da plataforma: uma porta REST governada para a composição integral de apps/páginas/menus/membros hoje exposta pelo ToolRegistry; deduplicação comprovada entre invocações; resultado persistido de operações ambíguas; exclusão transacional de workflows com versões; confirmação da retomada durável após HITL. A rota run-actions ainda consulta `definition_id`, enquanto o esquema observado usa `workflow_definition_id`; seu comportamento semântico não foi declarado como comprovado em produção. Benchmarks comparando agentes via FMX e MCP também permanecem necessários para afirmar superioridade de custo ou precisão.
