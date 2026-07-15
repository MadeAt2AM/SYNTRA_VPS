# Custom Domain Routing Fix (2026-07-15)

## Problem

CYBERSLIDE (`companies.id=19`) had set a custom domain `syntra.cyberslide.net`
with `domain_status='verified'` and `domain_verified_at=2026-07-14 22:46`.
Despite this:

- Visiting `https://syntra.cyberslide.net/` from a browser timed out /
  returned Caddy's default page (no vhost matched).
- Login from `https://syntra.terrybot.top/login` succeeded but the user was
  never redirected to `syntra.cyberslide.net`.

So every CYBERSLIDE user, no matter where they logged in, ended up on the
shared platform URL — defeating the white-label setup.

## Root cause: three layered bugs

| # | Layer | Bug | Symptom |
|---|---|---|---|
| A | Caddy reverse proxy | `/srv/caddy/sites/syntra.caddy` only declared the vhost `syntra.terrybot.top`. No vhost for `syntra.cyberslide.net` meant Caddy could not issue a Let's Encrypt cert for it, and there was no upstream reverse-proxy to `syntra-web:80`. | HTTPS requests hung / returned Caddy default |
| B | API auth flow | `POST /api/auth/login`, `POST /api/auth/register` (both invitation and new-company flows) returned no `redirectTo` field. After login the SPA always did a wouter `setLocation(...)` which can never cross origins. | Users remained on platform URL |
| C | CORS allowlist | `middlewares/cors.ts` hardcoded `["https://syntra.terrybot.top"]`. Even after fixing A and B, a browser posting from `syntra.cyberslide.net` would fail CORS preflight. | JS console blocked by browser |

### Live evidence gathered before any code change

```text
DNS:        syntra.cyberslide.net CNAME syntra.terrybot.top → 147.79.18.32  ✅
DB:         companies.id=19  name=CYBERSLIDE  custom_domain=syntra.cyberslide.net
              domain_status=verified  domain_verified_at=2026-07-14 22:46     ✅
DB:         companies.name=CYBERSLIDE NOT duplicated, user accounts present    ✅
API:        GET /api/public/branding?host=syntra.cyberslide.net →
              {"branded":true,"companyId":19,"name":"CYBERSLIDE",...}         ✅
Caddy:      /srv/caddy/sites/syntra.caddy has only `syntra.terrybot.top {...}` ❌
HTTPS:      curl -I https://syntra.cyberslide.net/ → blank/timeout             ❌
```

The application server already knew how to brand CYBERSLIDE on its custom
hostname — the database row and the `public.ts` route were correct. The
defects lived entirely in the proxy and the post-login flow.

## Fix

### Code changes (8 files, +224/−14, commit `ce183258`)

1. **`artifacts/api-server/src/lib/domain.ts`** — three new helpers:
   - `getCustomDomainHosts()` — single source of truth; reads from
     `SYNRA_CUSTOM_DOMAIN_HOSTS` env (comma-separated) and
     `/srv/secrets/syntra-custom-domains` (one hostname per line).
     Tolerant of the file being absent (local dev, first deploy).
   - `isKnownCustomDomain(host)` — allowlist check.
   - `buildCustomDomainUrl(host, path)` — returns `https://host/path` ONLY
     when `host` is in the allowlist. Returns `null` otherwise. Used as the
     open-redirect guard for every cross-origin redirect we issue.

2. **`artifacts/api-server/src/routes/auth.ts`** — `resolvePostAuthRedirect`
   helper called by every auth response (`/login`, `/register` invitation,
   `/register` new-company). Returns `null` whenever any of the three guards
   fail (no `customDomain`, `domainStatus !== "verified"`, request Host
   equals customDomain, or host not in allowlist). On success returns the
   absolute `https://<customDomain>/<destPath>` URL.

3. **`artifacts/api-server/src/middlewares/cors.ts`** — restructured the
   allowlist from a `string[]` to a merged `Set<string>`:
   `ALLOWED_ORIGINS` env ∪ `https://<REPLIT_DOMAINS>` ∪
   `https://<SYNRA_CUSTOM_DOMAIN_HOSTS>` ∪ last-resort
   `https://syntra.terrybot.top`. A fresh deploy without any of those vars
   still has the platform fallback so it never 500s on CORS.

4. **`artifacts/web-app/src/pages/{login,register,accept-invite}.tsx`** —
   `onSuccess` reads `response.redirectTo` (if present) and does a hard
   `window.location.assign(redirectTo)` before any other client routing.
   This is required because wouter's `setLocation` is in-memory and cannot
   cross origins; only a full-page navigation is correct here.

5. **`deploy/caddy/syntra.caddy`** — unchanged structure (heredoc inside
   `syntra_dev.sh` is the source of truth for the platform-host block).

6. **`deploy/syntra_dev.sh`** — new `write_extra_caddy()` function:
   - Seeds an empty `/srv/secrets/syntra-custom-domains` on first deploy
     with a header comment so the operator knows where to add hosts.
   - Reads the sidecar, builds `/srv/caddy/sites/syntra-extra-hosts.caddy`
     with one site block per host (same security headers, same `syntra-web:80`
     upstream as the platform host).
   - Calls Caddy reload via `docker exec caddy caddy reload --config
     /etc/caddy/Caddyfile`.
   - Wired into `do_redeploy()` and into the `teardown` command's cleanup.

### Why a sidecar file (not a DB-driven cron)

The pre-existing approach queried Postgres every 5 minutes and regenerated
Caddy config from `domain_status='verified' AND status='active'`. That has
two sharp edges:

- The DB is the source of truth for `domainStatus`, but the Caddy config is
  ephemeral host state on the proxy machine. They diverge when redeploys
  replay or roll back.
- A cron-polling pattern ties the proxy config to a DB connection — adds a
  SQL connection just to read three columns, for a config that changes
  maybe a few times per month.

The sidecar makes the proxy-side config the source of truth (it is, after
all — Caddy itself needs to know the hostname to issue a cert). The DB
still records `customDomain` for branding lookups and for the
`resolvePostAuthRedirect` check. A future improvement could sync one to the
other periodically, but the simpler model is sufficient today.

### VPS configuration applied

```bash
# 1. Append the customer domain to the secrets env (read by the api
#    container for both the CORS allowlist and the redirect allowlist).
echo 'SYNRA_CUSTOM_DOMAIN_HOSTS=syntra.cyberslide.net' >> /srv/secrets/syntra.env

# 2. Add the hostname to the Caddy sidecar (read by the deploy script to
#    materialise a per-host vhost with its own Let's Encrypt cert).
echo 'syntra.cyberslide.net' > /srv/secrets/syntra-custom-domains

# 3. Re-run the deploy to refresh .env, restart the api container, and
#    Caddy-reload with the new site block.
bash /srv/scripts/syntra_dev.sh redeploy
```

## Verification (live, after the redeploy settled)

| Check | Command | Result |
|---|---|---|
| Cert reachable on custom domain | `curl -sI https://syntra.cyberslide.net/` | **HTTP/2 200**, headers HSTS + X-Frame-Options DENY + CSP + via: Caddy |
| Branding endpoint resolves CYBERSLIDE | `GET /api/public/branding?host=syntra.cyberslide.net` (via Caddy) | `{"branded":true,"companyId":19,"name":"CYBERSLIDE",...}` |
| Login from platform URL → post-login bounce | `POST /api/auth/login` Host=syntra.terrybot.top body=`{chrisspeakstrue@…,Test123!}` | `{"token":"…","redirectTo":"https://syntra.cyberslide.net/dashboard", ...}` |
| Login from the custom URL → no bounce | `POST /api/auth/login` Host=syntra.cyberslide.net | `{"token":"…","redirectTo":null, ...}` ← same-host case correctly suppressed |
| Platform-admin login → no bounce | `POST /api/auth/login` Host=syntra.terrybot.top body=`{platform@syntra.com,Test123!}` | `{"redirectTo":null, ...}` ← no company = no redirect |
| Container health | `docker ps --filter name=syntra` | syntra_api / syntra_web / syntra_postgres all healthy |

The operator (Chris) can now point a browser at
`https://syntra.cyberslide.net/login` and see the CYBERSLIDE-branded
login screen. Logging in from either origin lands the user on
`syntra.cyberslide.net/dashboard` and stays there.

## Operational notes

* **Adding a new customer domain**: append to both
  `/srv/secrets/syntra-custom-domains` (one per line, `#`-comments OK) and
  `/srv/secrets/syntra.env` `SYNRA_CUSTOM_DOMAIN_HOSTS=<host>`, then
  `bash /srv/scripts/syntra_dev.sh redeploy`. Caddy issues a fresh LE cert
  in the background — first response may take 30–60s.
* **Removing**: delete the line in both files, redeploy. The next
  `teardown`/`extra` regeneration drops the orphan vhost.
* **Open-redirect defense**: a `companies.customDomain` row pointing at an
  attacker-controlled host can never produce a redirect because
  `buildCustomDomainUrl()` requires the host to be in
  `getCustomDomainHosts()` first.
* **Caddyfile formatter warning**: harmless whitespace quirk;
  `caddy fmt --overwrite` would normalise it but it does not affect
  parsing.

## Files touched

```
artifacts/api-server/src/lib/domain.ts                   | +57
artifacts/api-server/src/middlewares/cors.ts             | +27 -4
artifacts/api-server/src/routes/auth.ts                  | +53
artifacts/web-app/src/pages/accept-invite.tsx            | +7
artifacts/web-app/src/pages/login.tsx                    | +12
artifacts/web-app/src/pages/register.tsx                 | +15 -3
deploy/caddy/syntra.caddy                                | +1 -1
deploy/syntra_dev.sh                                     | +61 -1
docs/CUSTOM_DOMAIN_SETUP.md                              | +52
docs/CUSTOM_DOMAIN_ROUTING_FIX.md                        | (new, this file)
```

Commit: `feat(custom-domain): serve + post-login redirect on verified customer domains` → `ce183258` on `MadeAt2AM/SYNTRA_VPS`.
