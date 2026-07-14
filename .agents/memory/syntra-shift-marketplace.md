---
name: SYNTRA shift swap/offer/replacement architecture
description: How the three shift-marketplace mechanics (swap, offer, replacement) and their notifications are structured, for extending or debugging any of them.
---

SYNTRA has three distinct shift-marketplace mechanics, each with its own DB table, route file, and notification types. They are NOT part of `lib/api-spec/openapi.yaml` / Orval codegen — they use a hand-rolled fetch client in `artifacts/web-app/src/lib/notifications-api.ts` instead. Any new mechanic in this family should follow the same pattern rather than going through OpenAPI codegen.

- **Swap** (`shiftSwaps`): bidirectional trade of two published shifts between two employees; both shifts' `employeeId` flip on accept.
- **Offer** (`shiftOffers`): one employee opens their shift to the whole company; first-come-first-served claim reassigns `employeeId`.
- **Replacement** (`shiftReplacements`): one employee picks one specific colleague to take over their shift; only that colleague can accept/reject (unlike offer's open marketplace). One-directional — only the requester's shift changes hands, no swap-back.

Each has: a `token` + `expiresAt` column for an email accept/reject link (`GET /api/<route>/token/:token?action=accept|reject`), an authenticated `POST /:id/respond` route for in-app accept/reject, and notification rows inserted with a `type` string consumed by the frontend notification bell.

**Why:** keeping them as separate tables/routes (rather than unifying into one generic "shift request" table) mirrors how the product already separated swap vs offer, and avoids a nullable-column-soup schema; each mechanic's accept logic differs enough (2 shifts vs open pool vs 1 target user) that a shared table would need per-type branching everywhere anyway.

**How to apply:** the notification bell (`notification-bell.tsx`) maps each notification `type` to a `/schedule?panel=<swaps|offers|replacements>` deep link via a `TYPE_PANEL` lookup, and `schedule.tsx` reads that `panel` query param (via wouter's `useSearch`) on mount to auto-open the matching dialog. When adding a new marketplace mechanic, add its type(s) to `TYPE_PANEL`/`TYPE_ICON`/`TYPE_COLOR` in the bell and add a `panel === "<name>"` branch in schedule.tsx's deep-link effect.
