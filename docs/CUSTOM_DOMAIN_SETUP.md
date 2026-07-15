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
| Browser hitting `https://login.acme.com/` times out / returns Caddy default | No Caddy vhost for that hostname | Add the hostname to `/srv/secrets/syntra-custom-domains` (one per line), then `bash /srv/scripts/syntra_dev.sh redeploy` |
| Login response never includes `redirectTo`, but `domainStatus="verified"` in the DB | App env doesn't know about the customer domain | Add `SYNRA_CUSTOM_DOMAIN_HOSTS=login.acme.com` to `/srv/secrets/syntra.env`, then redeploy |
| Browser shows CORS error on `https://login.acme.com/api/public/branding` | Custom domain not in CORS allowlist | Add `https://login.acme.com` to `ALLOWED_ORIGINS` in `/srv/secrets/syntra.env` (the merged allowlist picks up `SYNRA_CUSTOM_DOMAIN_HOSTS` automatically, so this is usually automatic too) |

## Verified-custom-domain routing (post-login bounce)

Verified companies are automatically redirected to their own hostname after
login so the rest of the session (token storage, branding, password-reset
links, future redirects) lives on the customer's origin, not the platform's.

### Operator setup

```bash
# 1. Add the customer domains to the secrets env (comma-separated)
echo 'SYNRA_CUSTOM_DOMAIN_HOSTS=login.acme.com,login2.acme.com' >> /srv/secrets/syntra.env

# 2. Add the customer domains to the Caddy sidecar (one per line)
echo -e 'login.acme.com\nlogin2.acme.com' >> /srv/secrets/syntra-custom-domains

# 3. Redeploy (materializes the per-host Caddy site blocks + restarts containers)
bash /srv/scripts/syntra_dev.sh redeploy
```

After step 3, Caddy reloads and starts serving the platform's React app on
each custom domain with its own Let's Encrypt cert; the API learns about
them via the env var.

### End-user experience

* Someone visits `https://login.acme.com/login` directly → Caddy serves the
  app on that origin, the `/api/public/branding` endpoint returns the
  CYBERSLIDE/CYBERSLIDE logo, the user logs in, `redirectTo` is **null**,
  they stay on `login.acme.com`.
* Same user visits `https://syntra.terrybot.top/login` by mistake → the
  branding lookup shows generic SYNTRA; on successful login the API replies
  `{"redirectTo": "https://login.acme.com/dashboard", ...}` and the SPA
  does a `window.location.assign(redirectTo)` — full cross-origin
  navigation, so the new localStorage is scoped to `login.acme.com` for
  the rest of the session.
* Users without a verified custom domain get `redirectTo: null` and
  continue using `syntra.terrybot.top` as normal.

### Defenses

* The redirect destination is **always** validated against the in-process
  allowlist (`SYNRA_CUSTOM_DOMAIN_HOSTS` + `/srv/secrets/syntra-custom-domains`).
  A bogus `companies.customDomain` value in the DB can never lead to an
  arbitrary redirect.
* The redirect is suppressed when `req.hostname === customDomain`, so users
  already on their own domain never get bounced off it.
* The Caddy site block for each custom domain uses the same hardened
  security headers as the platform-host block (HSTS, X-Frame-Options
  DENY, CSP, Referrer-Policy, etc.).