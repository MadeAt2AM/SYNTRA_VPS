# SYNTRA Security Posture

The current security baseline for SYNTRA. Operator-facing — explains what's
protecting the platform and how to maintain it.

## Layers in depth

```
            ┌────────────────────────────────────────────┐
Internet →  │  Caddy (TLS 1.3 + Let's Encrypt + HSTS)    │  ← headers
            └────────────────┬───────────────────────────┘
                             │
            ┌────────────────▼───────────────────────────┐
            │  nginx (security headers + /api proxy)     │  ← headers
            └────────────────┬───────────────────────────┘
                             │
            ┌────────────────▼───────────────────────────┐
            │  Express 5 (cors + helmet + rate-limit)     │  ← headers
            │  Zod validation on every input             │  ← validation
            │  bcryptjs (cost 12) + JWT HS256            │  ← crypto
            │  Pino logs (no PII / creds)                 │  ← logging
            └────────────────┬───────────────────────────┘
                             │
            ┌────────────────▼───────────────────────────┐
            │  PostgreSQL (parameterised via Drizzle)    │  ← injection
            └────────────────────────────────────────────┘
```

## What runs on each request

1. **TLS terminated by Caddy** — TLS 1.3 only; Let's Encrypt auto-renewal.
   HSTS sent for 1 year.
2. **Caddy emits security headers**: `Strict-Transport-Security`,
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Content-Security-Policy`,
   `Cross-Origin-Opener-Policy: same-origin`.
3. **nginx** receives the request. Static asset responses and SPA responses
   carry the same headers (nginx `add_header` inside each `location` block).
   `/api/*` is reverse-proxied to the API container; the proxy adds
   `X-Real-IP` / `X-Forwarded-For` so rate-limit can see the real client IP.
4. **Express 5** receives the request. The app:
   - Sets `trust proxy = 1` (trust one hop — Caddy).
   - Disables `X-Powered-By: Express`.
   - Validates the request `Origin` against an allowlist (`ALLOWED_ORIGINS`).
   - Sets the same security headers (defense-in-depth).
   - Body-parses with a 256 KB limit.
   - Applies a 300 req/min global rate limit and a 10/15min IP + 5/15min
     email rate limit on `POST /api/auth/login`.
5. **Zod** validates the body/params of every route before the handler runs.
   Invalid input → 400 with field-level errors.
6. **Drizzle ORM** runs the query with parameter binding. No SQL string
   concatenation anywhere in the codebase.
7. **Pino** logs the request with method, URL (no query), status. No body,
   no headers, no IP in the request log. **Credentials never reach the log
   stream.**
8. **bcryptjs** (cost 12) verifies the password. JWT (HS256, server secret)
   is signed and returned in the JSON body. Tokens are stored by the SPA in
   `localStorage` and sent as `Authorization: Bearer <token>` on subsequent
   calls.

## Authentication

| Aspect | Value |
|---|---|
| Password hashing | bcryptjs, cost 12 |
| Session token | JWT HS256, signed with `SESSION_SECRET` (≥64 random bytes) |
| Token storage | SPA `localStorage` |
| Token transport | `Authorization: Bearer <token>` header |
| Login rate limit | 10/IP/15min, 5/email/15min |
| API rate limit | 300/IP/minute |
| Password minimum | 8 characters (NIST SP 800-63B baseline) |
| Account lockout | Not implemented; rely on rate-limit + monitoring |
| MFA / 2FA | Not implemented; recommend adding for admin accounts |

## CORS policy

- Allowlist-based: only origins in the `ALLOWED_ORIGINS` env var (or the
  default `https://syntra.terrybot.top`) can make cross-origin requests.
- Same-origin requests (no `Origin` header — curl, server-to-server) are
  always allowed.
- `credentials: false` — we don't use cookies.

To add another allowed origin, append to `/srv/secrets/syntra.env` and
restart the API:

```env
ALLOWED_ORIGINS=https://syntra.terrybot.top,https://app.acme.com
```

## Security headers (OWASP recommended)

Sent by Caddy, nginx, and Express (defense in depth):

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=()` |
| `Content-Security-Policy` | `default-src 'self'; … (see deploy/caddy/syntra.caddy)` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

## Logging

- **No PII in logs** — Pino serializer strips request body, headers, and
  query string.
- **No credentials in logs** — the same serializer prevents passwords from
  being logged even if the body parser is bypassed.
- **Errors logged to stderr** — full stack traces, but never returned to
  the client (the client sees a generic 500 message).

To inspect logs:

```bash
docker logs -f syntra_api   # tail
docker logs --since 5m syntra_api   # last 5 min
```

## Secret rotation

### Rotate `SESSION_SECRET` (every 6 months recommended)

```bash
# 1. Generate a new secret
NEW=$(openssl rand -base64 64)

# 2. Append to /srv/secrets/syntra.env (keep old value commented for rollback)
sudo sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$NEW|" /srv/secrets/syntra.env
chmod 600 /srv/secrets/syntra.env

# 3. Restart api — every user gets logged out, must re-login
cd /srv/projects/syntra
docker compose up -d --force-recreate api
```

### Rotate `POSTGRES_PASSWORD`

```bash
# 1. Generate
NEW=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

# 2. Update env
sudo sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$NEW|" /srv/secrets/syntra.env

# 3. Apply inside Postgres (as current postgres user)
docker exec -i syntra_postgres psql -U syntra -d syntra -c "ALTER USER syntra WITH PASSWORD '$NEW';"

# 4. Restart api + web
cd /srv/projects/syntra && docker compose up -d --force-recreate
```

### Rotate SMTP passwords

Stored per-company in the `companies.smtp_config` JSONB column. Update via
Settings → SMTP in the UI, or directly in DB:

```bash
docker exec -i syntra_postgres psql -U syntra -d syntra -c \
  "UPDATE companies SET smtp_config = jsonb_set(smtp_config, '{pass}', '\"NEW_PASSWORD\"') WHERE id = 1;"
```

### Rotate webhook secret

```bash
# 1. Generate
NEW=$(openssl rand -hex 32)

# 2. Update /etc/webhook/hooks.json (replace the secret string)
sudo sed -i "s|\"secret\": \"[a-f0-9]\{64\}\"|\"secret\": \"$NEW\"|" /etc/webhook/hooks.json

# 3. Restart webhook daemon
sudo systemctl restart webhook

# 4. Update the GitHub webhook secret (Settings → Webhooks → Edit) to match
```

## Incident response

If you suspect a breach:

1. **Rotate `SESSION_SECRET`** immediately (see above). All current JWTs
   become invalid.
2. **Rotate `POSTGRES_PASSWORD`** if DB access is suspected.
3. **Check access logs** for the timeframe in question:
   ```bash
   docker logs --since 24h syntra_api | grep -E "POST /api/auth|admin|platform"
   ```
4. **Check Postgres audit**:
   ```bash
   docker exec -i syntra_postgres psql -U syntra -d syntra -c \
     "SELECT email, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 20;"
   ```
5. **Notify affected users** within 72 hours (GDPR / PDPC).
6. **File a post-mortem** in `docs/INCIDENTS/` (create the folder).

## Vulnerability reporting

Email **security@madeat2am.in** with:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (your view)
- Your contact info (optional, for follow-up)

We aim to respond within 48 hours. We follow coordinated disclosure — please
allow us 90 days to patch before public disclosure.

## See also

- `docs/SECURITY_AUDIT.md` — full OWASP Top 10 audit (2026-07-14).
- `docs/CUSTOM_DOMAIN_SETUP.md` — operator guide for white-label routing.
- `docs/VPS_DEPLOYMENT.md` — full deploy runbook.