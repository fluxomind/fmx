# Review do WIP · modernização AXI

Base: feat/axi-cli-modernization, antes da ampliação das capacidades da plataforma.

## Findings corrigidos

- **P1 — repetir mutações após sucesso HTTP 204 ou JSON inválido.** O cliente tentava interpretar toda resposta como JSON e entrava no retry quando o parse falhava. DELETE 204 agora encerra com sucesso; respostas de sucesso inválidas falham sem repetir a operação.
- **P1 — retry de mutações sem garantia de deduplicação no servidor.** Uma chave de idempotência constante é necessária, mas não comprova que cada rota a aplica. POST/PUT/DELETE não são repetidos automaticamente após erro de rede/servidor. Uma rejeição 401 pode renovar a sessão e repetir uma vez; GET mantém retries transitórios.
- **P2 — classificação de flags inválidas do setup.** Valores inválidos de --ai-clients eram reportados como falha operacional (1). Agora produzem erro de uso (2), antes do preflight e de qualquer escrita. Na reprodução, vazio não abriu prompt no modo não interativo; o problema era a classificação e a validação dispersa.
- **P2 — corpo JSON false/null omitido.** A condição de truthiness do cliente descartava payloads JSON válidos. Agora somente undefined significa ausência de corpo.

## Validação

Build, verificação da skill gerada e 129 testes com Vitest passaram. Há testes específicos para 204, JSON de sucesso inválido, falha 503 em mutação e chave estável na renovação 401.

A ampliação da CLI será outro commit. Não há publicação nem alteração da plataforma neste review.
