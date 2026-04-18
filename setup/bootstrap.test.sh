#!/usr/bin/env bash
# Smoke test do bootstrap.sh.
#
# Modo 1 (default, no-docker):
#   - bootstrap.sh no host atual; espera exit 0 (assume que o host tem Node/npm).
# Modo 2 (--docker, opcional):
#   - bootstrap.sh dentro de ubuntu:22.04 zerado (sem Node) — espera exit 1 (FATAL).
#   - bootstrap.sh dentro de node:20 — espera exit 0.
# Modo 3 (--ci):
#   - Modo 1 + check adicional: exit code, check marks no stderr.
#
# Uso: bash packages/cli/setup/bootstrap.test.sh [--docker] [--ci]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.sh"

DOCKER=0
CI_MODE=0
for arg in "$@"; do
  case "$arg" in
    --docker) DOCKER=1 ;;
    --ci)     CI_MODE=1 ;;
  esac
done

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# --- Host check ---
echo ">> Test 1: bootstrap.sh on host"
if OUTPUT=$(bash "$BOOTSTRAP" 2>&1); then
  pass "host run exit 0"
else
  fail "host run exit != 0 — bootstrap nao deveria falhar na maquina dev. Output: $OUTPUT"
fi

if [ "$CI_MODE" = "1" ]; then
  echo ">> Test 2: check marks presentes"
  case "$OUTPUT" in
    *✓*) pass "check marks '✓' presentes" ;;
    *) fail "check marks ausentes no output" ;;
  esac
fi

# --- Docker checks (opcional) ---
if [ "$DOCKER" = "1" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "WARN: docker nao encontrado — pulando testes docker"
    exit 0
  fi

  echo ">> Test 3: ubuntu:22.04 (sem Node) — espera exit 1"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  SET_EXIT=0
  docker run --rm -v "$REPO_ROOT:/app:ro" ubuntu:22.04 bash /app/packages/cli/setup/bootstrap.sh >/dev/null 2>&1 || SET_EXIT=$?
  if [ "$SET_EXIT" -eq 1 ]; then
    pass "ubuntu bare exit 1 (FATAL detectado corretamente)"
  else
    fail "ubuntu bare deveria sair 1 (sem Node) — exit=$SET_EXIT"
  fi

  echo ">> Test 4: node:20 — espera exit 0"
  if docker run --rm -v "$REPO_ROOT:/app:ro" node:20 bash /app/packages/cli/setup/bootstrap.sh >/dev/null 2>&1; then
    pass "node:20 exit 0"
  else
    fail "node:20 deveria sair 0 (Node 20 presente)"
  fi
fi

echo "OK — bootstrap.test.sh concluido"
