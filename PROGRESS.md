# Workforce Scheduling App — Build Progress

Last updated: 2026-07-08

---

## ✅ Completed

- [x] Understand project structure (pnpm monorepo, Express 5, Drizzle ORM, PostgreSQL)
- [x] Define full Drizzle ORM schema (companies, users, workplaces, shifts, availability, leave_requests, time_logs, invitations)
- [x] Auth middleware — JWT via SESSION_SECRET, requireAuth, requireRole helpers
- [x] Auth routes — POST /api/auth/register (new company or invitation), POST /api/auth/login, GET /api/auth/me
- [x] Users routes — GET/PUT/DELETE /api/users, /api/users/:id (role-scoped)
- [x] Companies routes — GET/PUT /api/companies/:id (admin only for PUT)
- [x] Workplaces routes — full CRUD, admin/manager protected writes
- [x] Shifts routes — full CRUD + tenant cross-reference validation (employeeId, workplaceId)
- [x] Availability routes — full CRUD, employee-scoped reads, manager employeeId validated
- [x] Leave requests routes — submit, list, approve/reject (role-aware)
- [x] Time logs routes — clock-in (prevents double, validates shiftId ownership), clock-out, admin corrections
- [x] Invitations routes — create with token, list, delete
- [x] Global error handler in app.ts
- [x] Install bcryptjs + jsonwebtoken into api-server
- [x] Fix esbuild: add zod as direct api-server dependency, fix zod import paths
- [x] Push schema to PostgreSQL (drizzle-kit push)
- [x] Build server — clean, 2.0 MB bundle ✓
- [x] Write full OpenAPI spec (all endpoints, all schemas)
- [x] Seed test company: Acme Corp (id=1)
- [x] Seed all test user roles (admin, manager, staff ×2)
- [x] Verify all endpoints: login all roles, users, workplaces, shifts, leave requests ✓
- [x] Security fix: invitation token MUST match registering email ✓
- [x] Security fix: JWT secret has no fallback — throws at startup if SESSION_SECRET missing ✓
- [x] Security fix: tenant cross-reference validation on shifts/availability/time-logs ✓
- [x] Security fix: constant-time login rejection (prevents user enumeration) ✓
- [x] TypeScript fixes: parseId helper (safe int parse + 400 response), all req.params typed safely ✓
- [x] Remove drizzle-zod (incompatible with zod 3.25.x) — use $inferSelect/$inferInsert ✓
- [x] TypeScript clean — zero errors across libs + api-server ✓

---

## 📋 Follow-up Tasks (proposed)

- [ ] Build frontend web app (React + Vite) — schedule view, employee dashboard, leave management UI
- [ ] Add email delivery for invitation tokens (currently returned raw in API; needs SMTP or transactional email)
- [ ] Mobile companion app (Expo) — employee clock-in/out, shift view, availability submission

---

## 🧪 Test Credentials

All accounts belong to company **"Acme Corp"** (company_id = 1).

| Role          | Email               | Password        | Notes                          |
|---------------|---------------------|-----------------|--------------------------------|
| Admin (Owner) | admin@acme.com      | Admin1234!      | Full access, company creator. User id=1 |
| Manager       | manager@acme.com    | Manager1234!    | Can manage shifts & staff. User id=2 |
| Staff (Alice) | staff@acme.com      | Staff1234!      | employee role. User id=3       |
| Staff (Bob)   | staff2@acme.com     | Staff1234!      | employee role. User id=4       |

**Role mapping:**
- `admin` = platform Owner / Admin — creates the company, full CRUD on everything
- `manager` = Manager — can create shifts, approve leave, invite staff
- `employee` = Staff — can view own shifts, submit availability & leave, clock in/out

**How to get a token:**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"Admin1234!"}'
```
Use the returned `token` as `Authorization: Bearer <token>` on all protected endpoints.

---

## Seeded Test Data

- **Company:** Acme Corp (id=1, plan=professional, timezone=UTC)
- **Workplace:** Head Office, 123 Main St London (id=1, radius=200m)
- **Shift:** 2026-07-14 09:00–17:00 assigned to Alice (staff@acme.com), Cashier role, status=published (id=1)
- **Leave Request:** Alice, annual leave 2026-08-01 to 2026-08-05, status=pending (id=1)

---

## Architecture Notes

- Multi-tenant: all data scoped by `company_id`
- Auth: JWT Bearer tokens (7d expiry), signed with `SESSION_SECRET` — fails at startup if not set
- Registration: `companyName` → creates company + admin; `invitationToken` → joins existing company (email must match)
- Roles: `admin` (owner), `manager`, `employee` (staff)
- API base: `/api/*`
- Server port: reads `PORT` env var
