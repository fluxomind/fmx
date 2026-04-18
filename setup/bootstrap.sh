#!/usr/bin/env bash
# Fluxomind CLI — Pre-flight Bootstrap Check
#
# Roda em maquina zerada apos `npm install -g @fluxomind/cli`.
# Detecta pre-requisitos. NAO instala nada — apenas reporta.
#
# Uso:
#   bash $(npm root -g)/@fluxomind/cli/setup/bootstrap.sh
#
# Exit codes:
#   0 — todos os checks FATAL passaram (WARN/INFO toleraveis)
#   1 — pelo menos 1 check FATAL falhou
#
# Contrato detalhado: packages/cli/setup/configs/ + fmd-docs/2-backlog/EVO-392-codeEngine-setup-runbook/contracts.md §3

set -u

# ---------------------------------------------------------------------------
# Cor / TTY detection
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  C_OK="\033[32m"
  C_WARN="\033[33m"
  C_FAIL="\033[31m"
  C_INFO="\033[36m"
  C_DIM="\033[2m"
  C_RST="\033[0m"
else
  C_OK=""; C_WARN=""; C_FAIL=""; C_INFO=""; C_DIM=""; C_RST=""
fi

log_ok()   { printf "${C_OK}✓${C_RST} %s\n" "$*" >&2; }
log_warn() { printf "${C_WARN}⚠${C_RST} %s\n" "$*" >&2; }
log_fail() { printf "${C_FAIL}✗${C_RST} %s\n" "$*" >&2; }
log_info() { printf "${C_INFO}ℹ${C_RST} %s\n" "$*" >&2; }
log_hdr()  { printf "\n${C_DIM}%s${C_RST}\n" "$*" >&2; }

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
TELEMETRY=0
for arg in "$@"; do
  case "$arg" in
    --telemetry) TELEMETRY=1 ;;
    --help|-h)
      cat <<'EOF' >&2
Uso: bootstrap.sh [--telemetry]

  --telemetry   Ao final, loga metrica local (checks_passed/failed/duration_ms).
                Default OFF — nao envia nada para servidor.

Retorna exit 0 se todos FATAL OK, exit 1 se algum FATAL falhou.
EOF
      exit 0
      ;;
  esac
done

START_MS=$(date +%s)
FATAL_FAIL=0
CHECKS_PASSED=0
CHECKS_FAILED=0

pass() { CHECKS_PASSED=$((CHECKS_PASSED + 1)); }
fail() { CHECKS_FAILED=$((CHECKS_FAILED + 1)); }

# ---------------------------------------------------------------------------
# OS detection
# ---------------------------------------------------------------------------
log_hdr "Fluxomind CLI — Pre-flight Check"

OS_RAW=$(uname -s 2>/dev/null || echo "unknown")
case "$OS_RAW" in
  Darwin)  OS="macos" ;;
  Linux)
    if grep -qi microsoft /proc/version 2>/dev/null; then
      OS="windows-wsl"
    else
      OS="linux"
    fi
    ;;
  MINGW*|CYGWIN*|MSYS*) OS="windows" ;;
  *) OS="unknown" ;;
esac
log_ok "OS detected: $OS"
pass

# ---------------------------------------------------------------------------
# FATAL — Node.js >=18
# ---------------------------------------------------------------------------
log_hdr "Required"
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v 2>/dev/null | sed 's/^v//')
  NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | cut -d. -f1)
  if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
    log_ok "Node.js v${NODE_VERSION}"
    pass
  else
    log_fail "Node.js v${NODE_VERSION} encontrado; requer >=18"
    log_info "Install: https://nodejs.org/ (recomendado via nvm/fnm)"
    FATAL_FAIL=1
    fail
  fi
else
  log_fail "Node.js nao encontrado"
  log_info "Install: https://nodejs.org/ (recomendado via nvm/fnm)"
  FATAL_FAIL=1
  fail
fi

# ---------------------------------------------------------------------------
# FATAL — npm
# ---------------------------------------------------------------------------
if command -v npm >/dev/null 2>&1; then
  NPM_VERSION=$(npm -v 2>/dev/null)
  log_ok "npm v${NPM_VERSION}"
  pass
else
  log_fail "npm nao encontrado (normalmente vem com Node)"
  log_info "Reinstale Node.js: https://nodejs.org/"
  FATAL_FAIL=1
  fail
fi

# ---------------------------------------------------------------------------
# WARN — git
# ---------------------------------------------------------------------------
log_hdr "Recommended"
if command -v git >/dev/null 2>&1; then
  GIT_VERSION=$(git --version 2>/dev/null | awk '{print $3}')
  log_ok "git v${GIT_VERSION}"
  pass
else
  log_warn "git nao encontrado (necessario apenas para 'fmx init --git')"
  log_info "Install: https://git-scm.com/downloads"
  fail
fi

# ---------------------------------------------------------------------------
# INFO — Deno (opcional — so 'fmx test --local')
# ---------------------------------------------------------------------------
if command -v deno >/dev/null 2>&1; then
  DENO_VERSION=$(deno --version 2>/dev/null | head -1 | awk '{print $2}')
  log_ok "deno v${DENO_VERSION} (opcional)"
  pass
else
  log_info "deno nao encontrado (opcional — apenas 'fmx test --local'). Install: https://deno.land/"
fi

# ---------------------------------------------------------------------------
# INFO — Ollama (opcional — Continue+Ollama preset)
# ---------------------------------------------------------------------------
if command -v ollama >/dev/null 2>&1; then
  if curl -sf --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
    log_ok "ollama daemon rodando em localhost:11434"
    pass
  else
    log_warn "ollama instalado mas daemon nao esta rodando (use: 'ollama serve &')"
    fail
  fi
else
  log_info "ollama nao encontrado (opcional — Continue+Ollama preset). Install: https://ollama.com/"
fi

# ---------------------------------------------------------------------------
# INFO — fmx CLI
# ---------------------------------------------------------------------------
log_hdr "Fluxomind CLI"
if command -v fmx >/dev/null 2>&1; then
  FMX_VERSION=$(fmx --version 2>/dev/null | head -1)
  log_ok "fmx ${FMX_VERSION}"
  pass

  if fmx auth status 2>/dev/null | grep -qi "authenticated"; then
    log_ok "fmx autenticado"
    pass
  else
    log_warn "fmx nao autenticado — rode 'fmx auth login'"
    fail
  fi
else
  log_info "fmx nao encontrado. Install: 'npm install -g @fluxomind/cli'"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
END_MS=$(date +%s)
DURATION_MS=$(( (END_MS - START_MS) * 1000 ))

log_hdr "Summary"
printf "  ${C_OK}Passed:${C_RST} %d   ${C_WARN}Warn/fail:${C_RST} %d   ${C_DIM}Duration:${C_RST} %dms\n" \
  "$CHECKS_PASSED" "$CHECKS_FAILED" "$DURATION_MS" >&2

if [ "$TELEMETRY" = "1" ]; then
  printf "  ${C_DIM}[telemetry local]${C_RST} os=%s checks_passed=%d checks_failed=%d duration_ms=%d\n" \
    "$OS" "$CHECKS_PASSED" "$CHECKS_FAILED" "$DURATION_MS" >&2
fi

if [ "$FATAL_FAIL" = "1" ]; then
  log_fail "Pre-flight FAIL — resolva os checks FATAL antes de prosseguir"
  exit 1
fi

log_ok "Pre-flight OK — siga o runbook"
log_info "Runbook: cat \$(npm root -g)/@fluxomind/cli/docs/first-dev-setup.md"
exit 0
