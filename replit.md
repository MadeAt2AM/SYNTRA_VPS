# Workforce Scheduling App

A multi-tenant workforce scheduling and time-tracking API built on Express 5, PostgreSQL, and Drizzle ORM.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — build + start the API server (auto-detects `PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes to dev database (drizzle-kit)
- Required env: `DATABASE_URL` — auto-provisioned by Replit (runtime-managed)
- Required env: `SESSION_SECRET` — JWT signing key (already set as a Replit Secret)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, JWT auth (jsonwebtoken + bcryptjs)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod 3.x (inline in routes) + `drizzle-zod` (schema types)
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod validators)
- Build: esbuild (CJS bundle)

## Where things live

| Path | Purpose |
|------|---------|
| `artifacts/api-server/src/routes/` | All API route handlers |
| `artifacts/api-server/src/middlewares/auth.ts` | JWT middleware + signToken |
| `lib/db/src/schema/index.ts` | Drizzle table definitions (source of truth) |
| `lib/api-spec/openapi.yaml` | OpenAPI 3.1 spec (source of truth for codegen) |
| `lib/api-zod/src/generated/` | Generated Zod validators (do not edit) |
| `lib/api-client-react/src/generated/` | Generated React Query hooks (do not edit) |
| `PROGRESS.md` | Build progress, test credentials, seeded data |

## API Summary

All routes are prefixed `/api/`. Protected routes require `Authorization: Bearer <token>`.

| Tag | Endpoints |
|-----|-----------|
| auth | POST /auth/register, POST /auth/login, GET /auth/me |
| users | GET/PUT/DELETE /users, /users/:id |
| companies | GET/PUT /companies/:id |
| workplaces | Full CRUD /workplaces |
| shifts | Full CRUD /shifts |
| availability | Full CRUD /availability |
| leave-requests | Full CRUD /leave-requests + approve/reject |
| time-logs | Clock-in POST /time-logs, clock-out PUT /time-logs/:id |
| invitations | GET/POST/DELETE /invitations |

## Architecture decisions

- **JWT Bearer tokens** (not sessions): stateless, works for future mobile/frontend consumers; 7-day expiry
- **Multi-tenant by company_id**: every table has `company_id`; all queries are scoped to the authenticated user's company
- **Three roles**: `admin` (company owner/creator), `manager`, `employee` (staff)
- **Registration flow**: passing `companyName` creates a new company and makes the user admin; passing `invitationToken` joins an existing company with the invited role
- **Zod validation inline in routes** (not generated schemas) so route logic stays self-contained without a codegen step at startup

## Product

Workforce scheduling SaaS with:
- Company & multi-location workplace management
- Shift scheduling (draft → published → employee assignment)
- Employee availability submission
- Leave request workflow (submit → manager approve/reject)
- Clock in/out time tracking with GPS validation flag
- Invitation-based onboarding

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `zod` must be listed as a direct dependency in `artifacts/api-server/package.json` (not just a transitive dep) or esbuild can't resolve it during bundling
- `zod/v4` subpath import is NOT resolvable by esbuild — use `import { z } from "zod"` in all server-side code
- `DATABASE_URL` and other `PG*` vars are runtime-managed by Replit — do not set them manually
- After any schema change: run `pnpm --filter @workspace/db run push` then restart the api-server workflow
- After any OpenAPI spec change: run `pnpm --filter @workspace/api-spec run codegen` then typecheck

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Test credentials and seeded data: see `PROGRESS.md`
