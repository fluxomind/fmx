# FMX 0.5.0 — escopo e validação

Mudanças exclusivamente no FMX; nenhum patch na plataforma.

- Autenticação compartilhada entre HTTP/SSE, seleção de tenant e renovação única por tenant/processo. Negação 403 não renova nem repete a operação.
- Identidade remota filtrada, quota e doctor com verificação autenticada. Tokens de ambiente opacos são aceitos em planos e vinculados remotamente ao tenant antes dos efeitos.
- Nome canônico na criação de objeto e schemas de criação de objetos/campos no catálogo. Restauração pela rota de lifecycle.
- Export/import de modelagem dentro do contrato disponível; importação recusa seções não suportadas e sinaliza resultado parcial. Arquivos: upload multipart, consulta, listagem por alvo, vínculo, desvínculo e exclusão governada.
- Leituras de planos/preflight com concorrência máxima quatro, compartilhamento de schemas e drenagem das leituras em andamento após falha. Escritas continuam sequenciais e condicionais. Polling adaptativo mantém o deadline. Bundler incremental lê caminhos alterados, mede bytes UTF-8 e declara exclusões remotas não suportadas.
- Skill canônica versionada e catálogo gerado offline; cópia idêntica no ScheduleHub.

## Validação

232 testes automatizados (28 arquivos), build TypeScript e checagem de referências geradas. Fixtures cobrem cookie/Bearer, 403 sem repetição, SSE 401 com renovação, refresh concorrente, isolamento de tenant, preflight sem escritas em conflito, dry run sem HTTP, multipart, import parcial, concorrência e arquivos alterados/excluídos.

Build custom reutilizou a sessão existente em produção: identidade, quota e doctor; criação com nome canônico, retirada, restauração e retirada final de um objeto fictício; upload, consulta e exclusão de um arquivo fictício. O objeto ficou retirado com expurgo futuro previsto pelo servidor; o arquivo foi excluído. Não houve publicação de apps/canais. O smoke autenticado somente leitura passou em nove comandos (metadata, acesso, jobs, knowledge, ferramentas de agentes, aprovações, pendências, apps e dashboard). A exportação respondeu no remoto, mas retornou campos vazios na definição consultada, mantendo a ressalva de completude. Importação, vínculos e SSE foram verificados por fixtures de contrato, sem afirmar validação de ingestão ou implantação em produção.

Benchmark sintético local: 20 registros, um objeto, latência HTTP artificial de 40 ms, três amostras por versão. FMX 0.4.1: 1.082/1.056/1.041 ms (mediana 1.056 ms; 21 requests). FMX 0.5.0: 430/419/437 ms (mediana 430 ms; 22 requests, incluindo verificação adicional de identidade do token de ambiente). Redução de 59% neste cenário; não é medição nem garantia de latência da produção.

## Limites da plataforma

Exclusão de app draft e composição completa de páginas/menus/membros exigem contratos públicos adicionais. Exportação tem caps/omissões de origem e não é backup completo; importação suporta objetos/campos, não é transacional e não remapeia automaticamente relações entre tenants. A rota legada de chunks está desabilitada. Aceitação de upload dev não prova implantação; seu contrato não permite exclusões. `deploy --git` é explicitamente não suportado. Janela e projeção locais não são paginação/projeção de rede.
