#!/usr/bin/env bash
# endowGPT web-search healthcheck.
#
# Run from the repo root after `docker compose up -d`:
#   ./scripts/healthcheck.sh
#
# For the VPS run mode (loopback-only API behind Caddy):
#   VPS=1 ./scripts/healthcheck.sh
#
# Checks: SearXNG, the active scraper (PageSift or CRW), the optional
# LightPanda sidecar, LibreChat, and that no web-search service is published
# on a public interface. Exit 0 only when every required check passes.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.websearch.yml)
if [[ "${VPS:-0}" == "1" ]]; then
  COMPOSE_FILES+=(-f docker-compose.vps.yml)
fi

compose() {
  docker compose "${COMPOSE_FILES[@]}" "$@"
}

failures=0
passes=0
skips=0

pass() { printf '[PASS] %s%s\n' "$1" "${2:+ - $2}"; passes=$((passes + 1)); }
fail() { printf '[FAIL] %s%s\n' "$1" "${2:+ - $2}"; failures=$((failures + 1)); }
skip() { printf '[SKIP] %s%s\n' "$1" "${2:+ - $2}"; skips=$((skips + 1)); }

# ---------------------------------------------------------------- docker
if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose" "docker compose is not available"
  exit 1
fi

running_services="$(compose ps --status running --services 2>/dev/null || true)"

has_service() {
  printf '%s\n' "$running_services" | grep -qx "$1"
}

if has_service api; then
  pass "librechat container" "running"
else
  fail "librechat container" "service 'api' is not running"
fi

if has_service searxng; then
  pass "searxng container" "running"
else
  fail "searxng container" "service 'searxng' is not running"
fi

scraper_service=""
if has_service scraper-pagesift; then
  scraper_service="scraper-pagesift"
  pass "scraper container" "PageSift running"
elif has_service scraper-crw; then
  scraper_service="scraper-crw"
  pass "scraper container" "CRW running"
else
  fail "scraper container" "neither scraper-pagesift nor scraper-crw is running"
fi

# ------------------------------------------------------------ HTTP probes
http_ok() {
  local label="$1"
  local node_script="$2"
  if compose exec -T api node -e "$node_script" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label" "HTTP probe failed from the api container"
  fi
}

http_ok "searxng /healthz" \
  "fetch('http://searxng:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

if [[ -n "$scraper_service" ]]; then
  http_ok "scraper health" \
    "(async()=>{for(const u of ['http://scraper:3002/healthz','http://scraper:3002/health']){try{const r=await fetch(u);if(r.ok)process.exit(0)}catch{}}process.exit(1)})()"
fi

# LibreChat health from the host. The VPS override binds it to loopback.
PORT="${PORT:-3080}"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    pass "librechat /health" "127.0.0.1:${PORT}"
  else
    fail "librechat /health" "127.0.0.1:${PORT} did not answer"
  fi
else
  if compose exec -T api node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    pass "librechat /health" "in-container probe"
  else
    fail "librechat /health" "in-container probe failed"
  fi
fi

# ------------------------------------------------------ optional sidecar
sidecar=""
for candidate in endowgpt-lightpanda endowgpt-obscura; do
  if docker inspect "$candidate" >/dev/null 2>&1; then
    sidecar="$candidate"
    break
  fi
done

if [[ -z "$sidecar" ]]; then
  skip "js-render sidecar" "not running (expected unless the js-render profile is enabled)"
else
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$sidecar" 2>/dev/null || echo unknown)"
  if [[ "$health" == "healthy" || "$health" == "running" ]]; then
    pass "js-render sidecar" "$sidecar is $health"
  else
    fail "js-render sidecar" "$sidecar is $health"
  fi
fi

# --------------------------------------------------- published interfaces
check_not_public() {
  local container="$1"
  if ! docker inspect "$container" >/dev/null 2>&1; then
    return 0
  fi
  local mappings
  mappings="$(docker port "$container" 2>/dev/null || true)"
  if [[ -z "$mappings" ]]; then
    return 0
  fi
  if printf '%s\n' "$mappings" | grep -q '0\.0\.0\.0:\|\[::\]:'; then
    fail "public port on $container" "$mappings"
  else
    pass "loopback-only ports on $container" "$mappings"
  fi
}

for container in endowgpt-searxng endowgpt-scraper endowgpt-scraper-crw endowgpt-lightpanda endowgpt-obscura; do
  check_not_public "$container"
done

echo
printf 'Summary: %d passed, %d failed, %d skipped\n' "$passes" "$failures" "$skips"
if [[ "$failures" -gt 0 ]]; then
  exit 1
fi
exit 0
