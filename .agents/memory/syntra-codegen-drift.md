---
name: SYNTRA codegen drift
description: openapi.yaml can silently drift from the DB schema/routes; verifying "it typechecks" is not enough without checking spec completeness.
---

When new columns or endpoints are added to the API (e.g. company logoText/currency, shift-swaps, shift-offers, notifications, shifts/suggest), it's easy to add the DB column and Express route but forget to add it to `lib/api-spec/openapi.yaml`. The generated client (`@workspace/api-client-react`) then has a stale type (e.g. `Company` missing `logoText`), which only surfaces as a typecheck error in whatever frontend file references the new field — not at codegen time.

**Why:** codegen (`orval`) only regenerates types for what's declared in the spec; nothing enforces spec/DB/route parity automatically.

**How to apply:** when verifying "is this feature implemented," don't stop at reading the route handler and the frontend call site — grep `lib/api-spec/openapi.yaml` for the endpoint/field and confirm it's declared, then run `pnpm run typecheck` across the whole monorepo (not just one package) before declaring the feature done. If the spec is missing something, update it and re-run `pnpm --filter @workspace/api-spec run codegen`.

Also: Drizzle `timestamp` columns expect JS `Date` objects on insert, not ISO strings — passing `.toISOString()` compiles fine in isolation but fails type-checking against the insert schema. Grep how existing insert call sites in the same file construct `startTime`/`endTime` before adding a new one.
