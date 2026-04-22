# Manifest Schema Sync (CLI ↔ Monorepo)

> **EVO-394 D12 / CA-18 (Cross-repo coordination)**

O schema de `fluxomind.extension.toml` é **contrato público** validado em dois pontos:

1. **Cliente (CLI)** — `fmx validate` + `fmx publish` validam localmente antes de qualquer upload. Código: `src/lib/manifest-schema.ts` (cópia canônica) + `src/lib/manifest.ts` (parser estrutural).
2. **Servidor (monorepo `fluxomind/fluxomind-platform`)** — `/api/v1/appstore/submissions` e `/api/code-engine/deploy` revalidam via Zod schema canônico em `src/engine/codeEngine/manifest/schema.ts` (export `extensionManifestSchema`).

Os dois precisam **concordar**. Como são repos diferentes sem cross-import em runtime, sync é via release process.

## Processo de sync

### Quando o monorepo muda schema

1. Desenvolvedor do monorepo altera `src/engine/codeEngine/manifest/schema.ts` (nova EVO).
2. Essa EVO deve incluir task de sync — bumpar `@fluxomind/cli` com cópia atualizada.
3. Atualizar `src/lib/manifest-schema.ts` no repo fmx para refletir a mudança estrutural.
4. Release conjunta: tag no monorepo + tag `cli-v<next>-alpha.N` no fmx.

### Quando o CLI identifica drift (runtime)

- Se CLI valida OK mas servidor rejeita com `INVALID_MANIFEST`, é sinal de que schemas divergiram.
- Dev externo reporta como issue em `github.com/fluxomind/fmx`.
- Platform team verifica diff + bumpa CLI com cópia atualizada.

## Audit CI (monorepo)

O script `scripts/audit-profile-dev-parity.ts` (no monorepo) não valida schema, mas garante que os COMANDOS do CLI citados no playbook existem. Extensão futura: adicionar audit que compare campos do schema canônico com os campos referenciados no playbook.

## Cadência atual (2026-04-22)

- Monorepo HEAD: commit `857d356df` (EVO-394 Wave 2 MONO — exporta `extensionManifestSchema` via barrel)
- CLI HEAD: `@fluxomind/cli@0.3.0-alpha.1` (esta versão — sync inicial)

Próximo sync quando: schema mudar no monorepo (EVO que toca `schema.ts`) OU nova release do CLI que bumpar cópia por outro motivo.
