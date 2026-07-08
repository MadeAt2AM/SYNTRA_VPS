#!/usr/bin/env bash
# syntra_dev.sh — dev-VPS-side deploy helper for SYNTRA.
#
# Same shape as the shared /srv/scripts/project_dev.sh but tailored for SYNTRA:
#   - Clones SYNTRA_VPS (not SYNTRA) but deploys at subdomain `syntra`
#   - Reverse-proxies to the `syntra-web` (nginx) container on port 80, not the API
#   - Skips the host port mapping entirely (Caddy talks to the container directly
#     via the shared `web` network)
#
# Used by:
#   - GitHub webhook (port 9000) — auto-redeploy on push to main
#   - Manual `first-pull` / `teardown` invocations over SSH

set -euo pipefail

PROJECTS_DIR="/srv/projects"
PROJ_NAME="syntra"
REPO_NAME="SYNTRA_VPS"
GH_ORG="MadeAt2AM"
DOMAIN="terrybot.top"
Caddy_FILE="/srv/caddy/sites/${PROJ_NAME}.caddy"
TOKEN_FILE="/srv/scripts/.gh-token"
ENV_FILE="/srv/secrets/${PROJ_NAME}.env"

# Webhook daemon strips HOME — set sensible defaults for git + any HOME-needing tools.
export HOME="${HOME:-/root}"
export USER="${USER:-root}"

# Load Cloudflare DNS env if present (for the ensure_dns() call). Absent in old
# webhook invocations that don't have these set.
if [ -f /srv/scripts/.cf-env ]; then
  set -a
  # shellcheck disable=SC1091
  . /srv/scripts/.cf-env
  set +a
fi

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }

usage() {
  echo "Usage: syntra_dev.sh {first-pull|redeploy|status|logs|teardown}"
  exit 1
}

require_token() {
  if [ -n "${GH_TOKEN:-}" ]; then return 0; fi
  if [ -f "$TOKEN_FILE" ]; then
    GH_TOKEN=$(cat "$TOKEN_FILE")
    export GH_TOKEN
    return 0
  fi
  red "ERR: GH_TOKEN env var or $TOKEN_FILE required"
  exit 1
}

git_url() {
  echo "https://x-access-token:${GH_TOKEN}@github.com/${GH_ORG}/${REPO_NAME}.git"
}

ensure_dns() {
  # Idempotent: only create the A record if it doesn't already exist.
  if [ -z "${CF_API_TOKEN:-}" ] || [ -z "${CF_ZONE_ID:-}" ] || [ -z "${CF_DOMAIN:-}" ]; then
    yellow "  → CF_* env vars not set — skipping DNS (assume managed elsewhere)"
    return 0
  fi
  yellow "  → ensuring DNS A record ${PROJ_NAME}.${CF_DOMAIN} -> $(curl -s ifconfig.me 2>/dev/null || echo 147.79.18.32)"
  local ip
  ip=$(curl -s ifconfig.me 2>/dev/null || echo "147.79.18.32")
  local existing
  existing=$(curl -sS -H "Authorization: Bearer ${CF_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?type=A&name=${PROJ_NAME}.${CF_DOMAIN}" \
    | grep -o '"id":"[a-f0-9]\{32\}"' | head -1 || true)
  if [ -n "$existing" ]; then
    yellow "    DNS record already exists — skipping"
    return 0
  fi
  curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"${PROJ_NAME}.${CF_DOMAIN}\",\"content\":\"${ip}\",\"ttl\":60,\"proxied\":false}" \
    -o /dev/null -w "    dns create = HTTP %{http_code}\n"
}

write_caddy() {
  yellow "  → writing Caddy site block for ${PROJ_NAME}.${DOMAIN} (nginx :80 on web net)"
  cat > "$Caddy_FILE" <<EOF
${PROJ_NAME}.${DOMAIN} {
    reverse_proxy ${PROJ_NAME}-web:80
}
EOF
}

do_redeploy() {
  local proj_dir="${PROJECTS_DIR}/${PROJ_NAME}"
  mkdir -p "$PROJECTS_DIR" /srv/caddy/sites

  if [ ! -d "$proj_dir/.git" ]; then
    yellow "  → first clone from github.com/${GH_ORG}/${REPO_NAME}"
    mkdir -p "$proj_dir"
    cd "$proj_dir"
    git init -q
    git remote add origin "$(git_url)"
    git fetch --depth=1 origin main 2>&1 | tail -3
    git checkout -q -b main origin/main 2>/dev/null || git checkout -q --orphan main
    git config user.name  "MadeAt2AM Deployer" || true
    git config user.email "deploy@madeat2am.in"
  else
    yellow "  → git fetch + reset to origin/main"
    if ! git fetch --depth=1 origin main 2>&1 | tail -3; then
      red "  ✗ fetch failed — likely GitHub auth issue"
      return 1
    fi
    cd "$proj_dir"
    git reset --hard origin/main 2>&1 | tail -3
  fi

  if [ ! -f docker-compose.yml ]; then
    red "  ✗ no docker-compose.yml in repo"
    return 1
  fi

  # Materialize the env file for the project. First-deploy case: $proj_dir is
  # brand new and has no .env yet; subsequent redeploys reuse the existing one
  # so manual secrets tweaks (rotate SESSION_SECRET etc.) survive pushes.
  if [ ! -f "$proj_dir/.env" ]; then
    if [ ! -f "$ENV_FILE" ]; then
      red "  ✗ no $ENV_FILE — drop the secret env there before first deploy"
      return 1
    fi
    yellow "  → seeding .env from $ENV_FILE (first deploy)"
    cp "$ENV_FILE" "$proj_dir/.env"
    chmod 600 "$proj_dir/.env"
  fi

  yellow "  → docker compose up -d --build"
  docker compose up -d --build 2>&1 | tail -10

  write_caddy
  ensure_dns

  yellow "  → caddy reload"
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -3 || true

  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$proj_dir/.baymax-last-deploy"

  sleep 2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://${PROJ_NAME}.${DOMAIN}/" 2>/dev/null || echo "000")
  green "  ✓ deploy complete — https://${PROJ_NAME}.${DOMAIN}/ → HTTP ${code}"
  if [ "$code" != "200" ]; then
    yellow "    (cert provisioning can take 30–60s for first deploys; recheck in a minute)"
  fi
}

cmd="${1:-}"; shift || true
case "$cmd" in
  first-pull)
    require_token
    printf '%s' "$GH_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    do_redeploy
    ;;
  redeploy)
    require_token
    do_redeploy
    ;;
  status)
    local proj_dir="${PROJECTS_DIR}/${PROJ_NAME}"
    echo "── ${PROJ_NAME} (repo ${REPO_NAME}) ──"
    if [ -d "$proj_dir/.git" ]; then
      ( cd "$proj_dir" && git log --oneline -1 --format='  HEAD: %h %s (%ci)' 2>/dev/null ) || true
      [ -f "$proj_dir/.baymax-last-deploy" ] && echo "  last deploy: $(cat $proj_dir/.baymax-last-deploy)"
    else
      echo "  (no clone yet)"
    fi
    docker ps --filter "name=${PROJ_NAME}-" --format '  container: {{.Names}}  {{.Status}}  ports={{.Ports}}' 2>/dev/null || true
    echo "  url: https://${PROJ_NAME}.${DOMAIN}/"
    ;;
  teardown)
    local proj_dir="${PROJECTS_DIR}/${PROJ_NAME}"
    yellow "  → docker compose down"
    if [ -d "$proj_dir" ] && [ -f "$proj_dir/docker-compose.yml" ]; then
      ( cd "$proj_dir" && docker compose down -v 2>&1 | tail -5 ) || true
    fi
    yellow "  → removing $proj_dir"
    rm -rf "$proj_dir"
    yellow "  → removing caddy site block"
    rm -f "$Caddy_FILE"
    docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -3 || true
    green "  ✓ teardown complete"
    ;;
  ""|*) usage;;
esac
