# SYNTRA Database Schema Reference

Schema is owned by `@workspace/db` and applied to PostgreSQL via
`drizzle-kit push` (no migration files — the schema is the source of truth).

This document covers schema additions and lifecycle notes. For full DDL,
see `lib/db/src/schema/index.ts`.

---

## `users.webcal_token` + `users.webcal_token_created_at`

Added: 2026-07-15 (`feat(calendar): deep-link .ics into native calendar app`)

### Columns

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `webcal_token` | `text` | yes | NULL | Opaque URL credential; `crypto.randomUUID()` (RFC 4122 v4). Indexed lookup, no PII. |
| `webcal_token_created_at` | `timestamp` | yes | NULL | Set at mint time, used for future expiry / rotation policy. |

Both columns are nullable — users without a token have never clicked
"Add to Calendar". Token is set by `POST /api/calendar/token` (idempotent
mint-or-return), cleared by `DELETE /api/calendar/token` (revoke).

### Why a separate column, not a JWT?

Calendar apps (Apple Calendar, Google Calendar, Outlook, Thunderbird)
re-fetch the subscription URL on every sync interval. They cannot carry
a `Bearer` header — the credential has to live in the URL. JWTs in
URLs would also work in principle, but:

1. JWTs are short-lived (we use 7d). Tokens must be **long-lived** — if
   the user goes on holiday for 2 weeks, their calendar sync must keep
   working.
2. JWTs require a signing secret in the verification path on every
   fetch. A simple indexed lookup is cheaper and easier to revoke.
3. JWTs encode payload (role, company) which is unnecessary — we just
   need "yes this user is allowed to read their shifts".

The token is opaque to the client. It identifies the user; the
authorization rules (which shifts to expose) live in the route handler
based on `req.auth.role` populated from the DB lookup.

### Lifecycle

```
              ┌──────────────┐
   (never)    │              │   (after first
─────────────▶│  NULL token  │◀── "Add to Calendar"
              │              │     click on web)
              └──────┬───────┘
                     │ POST /api/calendar/token
                     │ (Bearer auth — must be logged in)
                     ▼
              ┌──────────────┐
              │  active      │   Used in webcal://<host>/api/calendar/
              │  UUID token  │   shifts.ics?token=<uuid>
              │              │
              │ webcal_token_│
              │ created_at   │
              │ = now()      │
              └──────┬───────┘
                     │ DELETE /api/calendar/token
                     │ (lost phone / offboarding)
                     ▼
              ┌──────────────┐
              │  NULL token  │   Old subscription URL returns 401.
              │              │   User must re-mint to subscribe again.
              └──────────────┘
```

### Security considerations

- **No expiry by default.** This is intentional — calendar sync must
  survive extended offline periods. If we add expiry later, the
  `webcal_token_created_at` column is already there to drive the
  rotation policy.
- **Revocation is instant.** A DELETE + DB update immediately invalidates
  the URL on the next sync.
- **Token leakage risk.** If the URL leaks (e.g. user shares a screenshot
  of their calendar settings), the attacker can read the user's shifts
  but CANNOT mutate them — `GET /api/calendar/shifts.ics` is read-only.
  Draft shifts are NOT exposed regardless (filter is hardcoded to
  `status = 'published'`).
- **No enumeration.** UUIDs are 122-bit random. Brute-forcing
  `users.webcal_token` is computationally infeasible.
- **CORS open.** `Access-Control-Allow-Origin: *` on the .ics endpoint
  is required so calendar apps on iOS/Android/macOS can fetch the URL
  from native code. The token IS the auth — CORS is not a bypass vector
  for the data (it's already public-by-token).

### Query patterns

**Mint (idempotent):**
```sql
INSERT INTO users (webcal_token, webcal_token_created_at)
VALUES ($1, now())
WHERE id = $2
ON CONFLICT (id) DO UPDATE
  SET webcal_token = EXCLUDED.webcal_token,
      webcal_token_created_at = EXCLUDED.webcal_token_created_at
  WHERE users.webcal_token IS NULL
RETURNING webcal_token;
```

Actually the implementation in `routes/calendar.ts` does a SELECT-then-
UPDATE for clarity. Both patterns work; the SELECT-then-UPDATE avoids
the surprise of rotating an existing token when mint is called twice.

**Lookup by token (the hot path):**
```sql
SELECT id, role, company_id, status
FROM users
WHERE webcal_token = $1
LIMIT 1;
```

**Index:** NOT added. At our scale (<10k users), the seq scan cost is
negligible. If we ever ship to >100k users, add a partial unique index:

```sql
CREATE UNIQUE INDEX users_webcal_token_idx
  ON users (webcal_token)
  WHERE webcal_token IS NOT NULL;
```

This is a partial index (only non-null tokens), keeping the index small
and write-friendly.

### Schema migration

Applied via:
```bash
docker compose run --rm migrate
```

Which runs `pnpm --filter @workspace/db push` inside the migrate
container. No downtime required — the columns are nullable and additive.

---

## Other schema notes

### `users.password_reset_token` + `users.password_reset_expiry`

Same pattern as `webcal_token` but with an explicit expiry timestamp.
Used by the password-reset flow. Cleared on successful reset.

### `users.must_change_password`

Boolean, defaults false. Set to true when:
- A platform admin creates a new tenant owner / admin (the temp
  password is echoed once in the 201 response — see platform-api.ts
  `tempPassword` field).
- An invitation token is redeemed.

Cleared after the user sets a new password. Forces a password rotation
on first login for admin-provisioned accounts.

### `shifts.status` enum

```ts
status: text("status").notNull().default("draft")
// valid values: "draft" | "published" | "cancelled"
```

The `published` filter is the gate for what shows up in calendar
subscriptions. Draft shifts never leak.
