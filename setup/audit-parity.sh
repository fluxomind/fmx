#!/usr/bin/env bash
# Audit paridade: comandos citados no runbook vs comandos expostos por `fmx --help`.
#
# Roda no CI (pre-release). Zero divergencia = CA-13 OK.
# Se o runbook cita `fmx xyz` e o CLI nao tem `xyz`, falha.
# Se o CLI expoe `abc` nao citado no runbook, apenas avisa (runbook nao precisa cobrir tudo).
#
# Uso: bash packages/cli/setup/audit-parity.sh [--runbook <path>] [--strict]
#
# Exit 0 — paridade OK
# Exit 1 — divergencia entre runbook e `fmx --help`

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNBOOK="${RUNBOOK_PATH:-$SCRIPT_DIR/../docs/first-dev-setup.md}"
STRICT=0

for arg in "$@"; do
  case "$arg" in
    --runbook) shift; RUNBOOK="${1:-$RUNBOOK}" ;;
    --strict) STRICT=1 ;;
  esac
  shift 2>/dev/null || true
done

if [ ! -f "$RUNBOOK" ]; then
  echo "ERRO: runbook nao encontrado em $RUNBOOK" >&2
  exit 1
fi

if ! command -v fmx >/dev/null 2>&1; then
  echo "WARN: fmx nao instalado no ambiente — pulando audit (CI deve instalar @fluxomind/cli antes)" >&2
  exit 0
fi

RUNBOOK_CMDS=$(grep -oE 'fmx [a-z][a-z0-9-]*' "$RUNBOOK" | sort -u)
FMX_CMDS=$(fmx --help 2>&1 | grep -oE '^  [a-z][a-z0-9-]*' | awk '{print "fmx "$1}' | sort -u)

MISSING=$(comm -23 <(printf '%s\n' "$RUNBOOK_CMDS") <(printf '%s\n' "$FMX_CMDS") || true)
EXTRA=$(comm -13 <(printf '%s\n' "$RUNBOOK_CMDS") <(printf '%s\n' "$FMX_CMDS") || true)

if [ -n "$MISSING" ]; then
  echo "ERRO: runbook cita comandos que nao existem em 'fmx --help':" >&2
  printf '  - %s\n' "$MISSING" >&2
  echo "Acao: corrigir runbook OR aguardar EVO que entrega o comando citado." >&2
  exit 1
fi

if [ -n "$EXTRA" ]; then
  echo "INFO: comandos do CLI nao cobertos no runbook (ok, runbook e introdutorio):" >&2
  printf '  - %s\n' "$EXTRA" >&2
  if [ "$STRICT" = "1" ]; then
    echo "ERRO: modo --strict exige cobertura total" >&2
    exit 1
  fi
fi

echo "Audit-parity OK — zero comandos do runbook ausentes no CLI"
