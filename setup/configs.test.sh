#!/usr/bin/env bash
# Valida os 7 templates de config dos AI clients:
#   1. JSON sintaticamente valido (jq empty)
#   2. Sem secrets hardcoded (eyJ, sk-*, github_pat, AKIA)
#   3. mcpServers/servers apontam para `fmx mcp serve` (sem drift de nomenclatura)
#
# Uso: bash packages/cli/setup/configs.test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIGS="$SCRIPT_DIR/configs"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERRO: jq requerido mas nao instalado" >&2
  exit 1
fi

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# --- JSON validation ---
echo ">> JSON validation"
FILES=$(find "$CONFIGS" -name '*.json')
if [ -z "$FILES" ]; then
  fail "nenhum JSON encontrado em $CONFIGS"
fi

while IFS= read -r f; do
  if jq empty "$f" 2>/dev/null; then
    pass "JSON valido: ${f#"$CONFIGS"/}"
  else
    fail "JSON invalido: $f"
  fi
done <<< "$FILES"

# --- Secret scan ---
echo ">> Secret scan"
if grep -rEn '(eyJ[A-Za-z0-9_=-]{20,}|sk-[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[0-9A-Z]{16})' "$CONFIGS" 2>/dev/null; then
  fail "secrets hardcoded detectados nos templates acima"
fi
pass "zero secrets hardcoded"

# --- Command nomenclature check ---
echo ">> Command nomenclature (fmx mcp serve)"
EXPECTED='"mcp", "serve"'
while IFS= read -r f; do
  if grep -q '"command": "fmx"' "$f"; then
    if grep -q "$EXPECTED" "$f"; then
      pass "fmx mcp serve: ${f#"$CONFIGS"/}"
    else
      fail "nomenclatura drift em $f — esperado args contem \"mcp\", \"serve\""
    fi
  fi
done <<< "$FILES"

echo "OK — configs.test.sh concluido"
