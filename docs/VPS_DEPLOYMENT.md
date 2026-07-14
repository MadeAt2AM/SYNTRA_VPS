# SYNTRA VPS Deployment Guide

How to take a fresh VPS and stand up SYNTRA against it. Written from the
perspective of the MadeAt2AM dev VPS (Hetzner Helsinki, IP `147.79.18.32`,
domain `terrybot.top`).

## Prerequisites

- Ubuntu 22.04+ or Debian 12+ on the VPS
- Docker Engine 24+ and `docker compose` plugin
- A GitHub account with admin access to the deployment repo
- A Cloudflare account managing the public DNS zone (optional but recommended)

## One-time host setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
usermod -aG docker deploy

# Optional — fix MTU 1400 on Hetzner (avoids SMTP/TLS hangs):
sudo tee /etc/docker/daemon.json <<EOF
{
  "mtu": 1400,
  "default-network-options": {}
}
EOF
sudo systemctl restart docker
```

## First deploy

```bash
# 1. Seed secrets (never commit these)
sudo mkdir -p /srv/secrets /srv/scripts /srv/projects /srv/caddy/sites
sudo cp .env.example /srv/secrets/syntra.env
$EDITOR /srv/secrets/syntra.env          # fill in POSTGRES_PASSWORD, SESSION_SECRET, etc.
chmod 600 /srv/secrets/syntra.env

# 2. Drop the deploy helper
sudo cp deploy/syntra_dev.sh /srv/scripts/
sudo chmod +x /srv/scripts/syntra_dev.sh

# 3. Trigger first deploy
GH_TOKEN=<github PAT with repo:contents read> \
  /srv/scripts/syntra_dev.sh first-pull
```

The script clones the repo, materialises `.env` from the secrets file, runs
`docker compose up -d --build`, runs the Drizzle migration, writes the Caddy
site block, and reloads Caddy.

## Auto-redeploy via GitHub webhook

```bash
# /etc/webhook/hooks.json (already configured on the MadeAt2AM dev VPS)
[{
  "id": "github-push-syntra",
  "execute-command": "/srv/scripts/syntra_dev.sh",
  "pass-arguments-to-command": [
    {"source": "string", "name": "redeploy"}
  ],
  "include-command-output-in-response": true,
  "user": "deploy",
  "trigger-rule": {
    "and": [
      {"match": {"type": "payload-hmac-sha256",
                 "secret": "<webhook secret>",
                 "parameter": {"source": "header", "name": "X-Hub-Signature-256"}}},
      {"match": {"type": "value", "value": "refs/heads/main",
                 "parameter": {"source": "payload", "name": "ref"}}},
      {"match": {"type": "value", "value": "SYNTRA_VPS",
                 "parameter": {"source": "payload", "name": "repository.name"}}}
    ]
  }
}]
```

Register this webhook in the GitHub repo (Settings → Webhooks) pointing at
`http://<vps>:9000/hooks/github-push-syntra`. Pushes to `main` will then
redeploy the stack automatically.

## Required env vars

See `.env.example`. The key ones:

| Var | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | DB password |
| `SESSION_SECRET` | JWT signing key (≥64 random chars) |
| `APP_BASE_URL` | Public URL — used to build password-reset links |
| `CONTACT_SMTP_*` | Platform-wide enquiry form SMTP |
| `REPLIT_DOMAINS` | **Required for custom-domain DNS verification.** Comma-separated platform hostnames a customer's CNAME/A record must resolve to. See `docs/CUSTOM_DOMAIN_SETUP.md`. |
| `REPLIT_DEV_DOMAIN` | Single fallback hostname for the same purpose. |

## Database schema

The schema is managed by Drizzle (`lib/db/src/schema/index.ts`) and applied
on every `docker compose run --rm migrate`. To add a new table or column,
edit the schema file then push:

```bash
docker compose run --rm migrate
```

## Seeding test users

`deploy/seed_demo_users_v2.sh` creates Demo Co + 5 test users using
Postgres `crypt()` for bcryptjs-compatible hashes:

| Email | Role | Company |
|---|---|---|
| `platform@syntra.com` | platform_admin | — |
| `admin@demo.com` | admin (Alex) | Demo Co |
| `manager@demo.com` | manager (Ronny) | Demo Co |
| `staff1@demo.com` | employee (Alice) | Demo Co |
| `staff2@demo.com` | employee (Jack) | Demo Co |

All with password `Test123!`.

## Common operations

```bash
# Status of all syntra containers
/srv/scripts/syntra_dev.sh status

# Tail API logs
docker logs -f syntra_api

# Tail web logs
docker logs -f syntra_web

# Tail Postgres logs
docker logs -f syntra_postgres

# Open psql
docker exec -it syntra_postgres psql -U syntra -d syntra

# Tear down everything (volumes included)
/srv/scripts/syntra_dev.sh teardown
```

## Troubleshooting

**`syntra_web` reports `unhealthy`** — nginx liveness check via BusyBox
`wget` defaults to IPv6 (`::1`), which nginx isn't bound to. Fixed by using
`http://127.0.0.1/index.html` in the healthcheck (already patched in
`deploy/docker/Dockerfile.web`).

**Custom-domain verify returns `"Platform host is not configured yet"`** —
`REPLIT_DOMAINS` is missing from `/srv/secrets/syntra.env`. See
`docs/CUSTOM_DOMAIN_SETUP.md`.

**`docker compose` build hangs at pnpm install** — Hetzner's MTU. Apply the
`/etc/docker/daemon.json` snippet above and `systemctl restart docker`.

**Caddy returns 502 after webhook redeploy** — transient, the web container
needs ~5s to recreate. Wait and retry.

**Webhook signature mismatch errors** — the shared secret in
`/etc/webhook/hooks.json` and the GitHub webhook configuration must match.