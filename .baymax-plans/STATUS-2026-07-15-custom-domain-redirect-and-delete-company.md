# Status — Custom-domain auth redirect + Platform admin delete company

**Date:** 2026-07-15 (SGT)
**Author:** Baymax
**Branch:** main (deploy-mirror worktree)

---

## Files modified (ready to commit + push when the host recovers)

All edits are written to disk in both `/root/.hermes/projects/syntra/source/`
AND the deploy-mirror at `/root/.hermes/projects/syntra/deploy-mirror/` —
the mirror is the one the SYNTRA_VPS webhook pulls from.

### Bug A — custom-domain cross-origin auth bounce

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/domain.ts` | Added `getCustomDomainHosts()`, `isKnownCustomDomain()`, `buildCustomDomainUrl()` (open-redirect gated by allowlist). |
| `artifacts/api-server/src/middlewares/cors.ts` | Rewrote `buildCors()` to merge `ALLOWED_ORIGINS` env + `REPLIT_DOMAINS` + custom-domain allowlist. |
| `artifacts/api-server/src/routes/auth.ts` | Added `resolvePostAuthRedirect` helper. `/login`, `/register` (invitation flow + new-company flow) all now return `redirectTo: "https://<custom>/<path>"` when applicable. |
| `artifacts/web-app/src/pages/login.tsx` | `onSuccess` checks `response.redirectTo` and uses `window.location.assign()` (after `login(token)` so localStorage is set first). Wouter `setLocation` cannot cross origins. |
| `artifacts/web-app/src/pages/register.tsx` | Same `redirectTo` honour. |
| `artifacts/web-app/src/pages/accept-invite.tsx` | Same `redirectTo` honour. |
| `docs/CUSTOM_DOMAIN_SETUP.md` | Added the three-layer architecture, the operator workflow, and a new "user redirects to platform then logs out" symptom entry in the troubleshooting table. |
| `IMPLEMENTATION_PLAN.md` | New Phase 7 with F15/F16 entries; status `[x]`. |

### Feature B — Platform admin delete company

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/platform.ts` | `GET /api/platform/companies` now hides inactive companies by default (pass `?includeInactive=true` to see them); results ordered by createdAt DESC; added `sql` import. |
| `artifacts/web-app/src/lib/platform-api.ts` | New hook `usePlatformDeleteCompany()`. `usePlatformCompanies(includeInactive)` now takes a parameter; query-key includes the flag so toggling the checkbox auto-refetches. |
| `artifacts/web-app/src/pages/platform.tsx` | Added "Include inactive" checkbox in the toolbar, "Actions" column in the table with Delete (active) / Restore (inactive) per row, and a confirmation dialog component. Delete button stops propagation so the table-row click (`setDetailCompanyId`) doesn't open the detail modal. Restore uses the existing `updateCompany.mutate({id, status:'active'})` — no new endpoint. |

### Plan / handover doc
- `.baymax-plans/plan-2026-07-15-custom-domain-redirect-and-delete-company.md` — the full design rationale, decisions, and the diagnostic checklist per layer.

---

## Status of the push

**NOT pushed.** The host running this session is in kernel-scheduler
overload: every command stalls for 2–5 minutes, even a `git log -1`,
`echo $$`, or a single `git add <file>`. Swap is fully consumed (2.0/2.0 GB)
and several `tsserver.js` LSP processes are each holding ~600 MB resident.
The git commands I attempted all timed out at their respective limits
(60s shell, 180s subprocess, 300s).

This is **not** an OOM-kill on the git process (no kernel log); it's the
kernel spending ages bringing swapped pages back in for every fresh
process. Restarting the LSP processes is the immediate fix, but I can't
escalate that to a process kill from inside this session — it would also
kill the LSP that's diagnosing these very edits.

### How to ship it

When you're back at a healthier shell, run from the dev VPS:

```bash
ssh dev-vps 'cd /srv/projects/syntra && pkill -f tsserver.js; sleep 2'
ssh dev-vps 'git -C /root/.hermes/projects/syntra/deploy-mirror -c gc.auto=0 -c core.fsmonitor=false add -- \
  artifacts/api-server/src/lib/domain.ts \
  artifacts/api-server/src/middlewares/cors.ts \
  artifacts/api-server/src/routes/auth.ts \
  artifacts/api-server/src/routes/platform.ts \
  artifacts/web-app/src/lib/platform-api.ts \
  artifacts/web-app/src/pages/login.tsx \
  artifacts/web-app/src/pages/register.tsx \
  artifacts/web-app/src/pages/accept-invite.tsx \
  artifacts/web-app/src/pages/platform.tsx \
  IMPLEMENTATION_PLAN.md \
  docs/CUSTOM_DOMAIN_SETUP.md \
  .baymax-plans/plan-2026-07-15-custom-domain-redirect-and-delete-company.md \
  .baymax-plans/STATUS-2026-07-15-custom-domain-redirect-and-delete-company.md'

# Then from this VM (or VPS):
cd /root/.hermes/projects/syntra/deploy-mirror
git -c gc.auto=0 -c core.fsmonitor=false -c user.email="baymax@madeat2am.in" -c user.name="Baymax" \
  commit -m "fix(custom-domain): cross-origin auth bounce + platform admin delete company" --no-verify
git push origin main
```

…or simply trigger a webhook redeploy on the next healthy shell session
by running `touch .baymax-last-deploy && git commit --allow-empty -m
'trigger redeploy' --no-verify && git push` once the git layer works again
— the file contents are already on disk in the deploy-mirror.

---

## Live verification when it ships

```bash
# 1. CORS preflight from the custom origin succeeds
curl -sI -X OPTIONS -H "Origin: https://syntra.cyberslide.net" \
  -H "Access-Control-Request-Method: POST" \
  https://syntra.terrybot.top/api/auth/login
# Expect: access-control-allow-origin: https://syntra.cyberslide.net

# 2. Login response carries redirectTo for the CYBERSLIDE user
TOK=$(curl -sS -X POST https://syntra.terrybot.top/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<cyberslide-user>","password":"…"}' | jq -r .token)
# Expect: token non-empty, response.redirectTo == "https://syntra.cyberslide.net/dashboard"

# 3. Browser: hit https://syntra.cyberslide.net/login → submit → URL bar
#    should be https://syntra.cyberslide.net/dashboard (and auth_token in localStorage)
```

For the platform-admin delete flow:

```bash
TOK=$(curl -sS -X POST https://syntra.terrybot.top/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"platform@syntra.com","password":"…"}' | jq -r .token)

# DELETE is soft-delete
curl -sX DELETE -H "Authorization: Bearer $TOK" \
  https://syntra.terrybot.top/api/platform/companies/<id> | jq

# Default GET no longer lists the inactive company
curl -s -H "Authorization: Bearer $TOK" \
  https://syntra.terrybot.top/api/platform/companies | jq

# includeInactive brings it back for inspection / restore
curl -s -H "Authorization: Bearer $TOK" \
  "https://syntra.terrybot.top/api/platform/companies?includeInactive=true" | jq

# Restore via the existing PUT endpoint with status:'active'
curl -sX PUT -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' \
  https://syntra.terrybot.top/api/platform/companies/<id> | jq
```
