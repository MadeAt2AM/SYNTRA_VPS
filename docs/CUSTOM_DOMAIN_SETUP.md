# Custom Domain (White-Label Routing)

SYNTRA lets each company point a custom hostname at the platform (e.g.
`login.acme.com`) instead of using the shared `syntra.terrybot.top` URL. When a
visitor hits that hostname, the platform returns the right company's branding
automatically.

## How it works

1. A company admin (or the platform admin) sets a `customDomain` on the
   company record via `PUT /api/platform/companies/:id`.
2. The platform stores `domainStatus = 'pending'`.
3. The admin calls `POST /api/platform/companies/:id/domain/verify`. The
   platform looks up the CNAME/A records for the requested hostname and
   checks whether they resolve to a configured platform host.
4. If verification passes, `domainStatus` flips to `verified` and
   `domainVerifiedAt` is stamped. Public branding on
   `GET /api/public/branding?host=<hostname>` then returns that company's
   `logoUrl`, `logoText`, and `name`.

## Required platform-side configuration

The DNS verifier reads two environment variables to know which hostnames it
should accept as a valid target:

```env
# Comma-separated list of hostnames a customer's DNS record must resolve to.
# Set this to your public domain(s).
REPLIT_DOMAINS=syntra.terrybot.top

# Single fallback dev hostname (Replit convention; works for any single-host
# deploy too).
REPLIT_DEV_DOMAIN=syntra.terrybot.top
```

> **Why are these called `REPLIT_*`?** The codebase was originally authored on
> Replit, where those env vars were the canonical way to expose a Replit
> app's hostname. They've been preserved for compatibility with upstream.
> Don't rename — it would break the DNS check.

These env vars must be present in `/srv/secrets/syntra.env` on the VPS. The
production `docker-compose.yml` already loads that file via `env_file:` on
the `api` service, so any new vars added to the secrets file are picked up
automatically — no compose edits required.

## Verifying

```bash
TOK=$(curl -sS -X POST https://syntra.terrybot.top/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"platform@syntra.com","password":"…"}' \
  | jq -r .token)

# 1. Tell the platform which domain to expect
curl -sS -X PUT https://syntra.terrybot.top/api/platform/companies/1 \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d '{"customDomain":"login.acme.com"}'

# 2. Get DNS setup instructions (returns the CNAME target)
curl -sS https://syntra.terrybot.top/api/platform/companies/1/domain/dns-instructions \
  -H "Authorization: Bearer $TOK"

# 3. Once the customer has published the CNAME, ask the platform to re-check
curl -sS -X POST https://syntra.terrybot.top/api/platform/companies/1/domain/verify \
  -H "Authorization: Bearer $TOK"
```

## Customer-side DNS setup

Tell the customer (in their DNS provider) to publish either:

- **CNAME (preferred)**: `login.acme.com → syntra.terrybot.top`
- **A record** (if CNAME not allowed at the apex): `login.acme.com → 147.79.18.32`

Propagation typically takes a few minutes but can be up to 48h depending on
the registrar's TTL.

## Resetting a custom domain

```bash
curl -sS -X PUT https://syntra.terrybot.top/api/platform/companies/1 \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d '{"customDomain":null}'
```

This clears the field and resets `domainStatus` back to `none`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `domainStatus` stuck on `pending` | DNS not propagated | Wait, then call `/domain/verify` again |
| `/domain/verify` returns `"Platform host is not configured yet"` | `REPLIT_DOMAINS` not set | Add `REPLIT_DOMAINS=syntra.terrybot.top` to `/srv/secrets/syntra.env` and `docker compose up -d api` |
| `/domain/verify` returns `"CNAME points to …, expected syntra.terrybot.top"` | CNAME is wrong | Customer must repoint CNAME |
| `/domain/verify` returns `"No DNS record found"` | No CNAME or A record published | Customer hasn't published DNS yet |
| `target: null` in `/dns-instructions` | Same as "Platform host not configured" | See above |