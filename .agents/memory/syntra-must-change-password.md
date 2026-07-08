---
name: SYNTRA mustChangePassword flow
description: How the force-password-change-on-first-login feature works end to end
---

**DB column:** `must_change_password boolean NOT NULL DEFAULT false` on users table (already applied via ALTER TABLE and in Drizzle schema).

**Login flow:**
1. POST /api/auth/login returns `{ token, user: { ..., mustChangePassword } }`
2. Frontend login.tsx reads `(response as any).user?.mustChangePassword`
3. Calls `login(token, mustChangePassword)` which sets localStorage("must_change_password", "1") if true
4. Navigates to /change-password if true, else to /dashboard or /platform

**Guard in App.tsx:**
- `RequireAuth` checks `user?.mustChangePassword` (from enriched user in use-auth.tsx)
- If true and not already at /change-password, redirects there
- /change-password is still a RequireAuth route (user must be logged in)

**use-auth.tsx enrichment:**
- `enrichedUser.mustChangePassword` = `user.mustChangePassword ?? localStorage.get("must_change_password") === "1"`
- This handles cases where the generated UserProfile type doesn't include mustChangePassword yet

**Clearing the flag:**
- POST /api/auth/change-password sets mustChangePassword=false in DB
- change-password.tsx clears localStorage("must_change_password") on success
- Redirects via `window.location.href` (hard reload) to refresh auth context

**Why localStorage fallback:** The generated @workspace/api-client-react UserProfile type doesn't have mustChangePassword. Rather than regenerating the client, the flag is stored in localStorage as a simple workaround.
