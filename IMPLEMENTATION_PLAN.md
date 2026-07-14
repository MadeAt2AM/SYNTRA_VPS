# SYNTRA — Feature Implementation Plan

Last updated: 2026-07-11  
Agent handover document — check off items as completed.

---

## Status Key
- `[ ]` Not started
- `[x]` Complete
- `[~]` In progress

---

## DB Schema Changes Required (for VPS migration)

After all features are implemented, the following schema changes must be migrated on the VPS PostgreSQL instance:

### New columns on `companies`
```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_text TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
```

### New columns on `shifts`
```sql
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_suggested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS suggested_data JSONB;
```

### New table: `shift_swaps`
```sql
CREATE TABLE IF NOT EXISTS shift_swaps (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  target_employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP,
  responded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### New table: `shift_offers`
```sql
CREATE TABLE IF NOT EXISTS shift_offers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  offered_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  taken_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  taken_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### New table: `notifications`
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## Feature List

### Phase 1 — Settings & Config

- [x] **F1: Fix SMTP company emails** — Gmail STARTTLS fix (requireTLS), better error surfacing
- [x] **F2: Logo upload / text logo** — Admin sets text logo or image URL; displayed in header instead of "SYNTRA"
- [x] **F3: Currency setting** — Admin sets currency (USD/GBP/EUR/AUD/etc.); used in payroll display and CSV exports

### Phase 2 — Timezone

- [x] **F4: Company timezone** — Roster grid and all date displays use company timezone, not browser timezone. Timezone selector changed from free-text to searchable dropdown in settings.

### Phase 3 — Availability Enhancements

- [x] **F5: Unavailable days** — Employees can mark days as unavailable (reddish in roster, distinct from available)
- [x] **F6: Availability time input** — When marking a day available, employee can optionally enter start/end time

### Phase 4 — Roster Tools

- [x] **F7: iCal export** — Employee one-click generates .ics file of all their published shifts (weekly or monthly) importable to Apple/Google Calendar
- [x] **F8: Export monthly roster CSV** — Vertical staff names, horizontal dates; manager/admin exports full month as CSV
- [x] **F9: Import shifts from CSV** — Manager imports monthly/weekly shifts from CSV; download template button pre-fills staff names + dates for the month
- [x] **F10: Bulk apply presets** — In schedule page, select multiple days for a staff member and apply a preset to all at once

### Phase 5 — Shift Workflows

- [x] **F11: Shift swap** — Employee requests swap of their published shift with another employee's shift; target employee gets email + in-app notification to confirm; on confirm, manager/owner notified
- [x] **F12: Shift offer (give away)** — Employee offers up their shift; all employees get in-app notification; manager warned of potential shortage; first employee to claim gets it; manager + all employees notified when filled

### Phase 6 — Smart Scheduling

- [x] **F13: Shift suggestion algorithm** — Greedy heuristic: uses last week's shifts + availability + unavailability to suggest next week's schedule. No LLM. Fills least-covered staff first.
- [x] **F14: Suggested badge + one-click approval** — Suggested shifts show a "Suggested" badge in the roster. Above the grid, manager sees "Approve All Suggestions" button; can also approve individually per shift.

---

## Files Changed (for VPS agent reference)

### Backend (`artifacts/api-server/src/`)
- `lib/email.ts` — SMTP fix (requireTLS for STARTTLS)
- `routes/companies.ts` — logoText + currency fields
- `routes/shifts.ts` — isSuggested field, suggestion endpoint
- `routes/shift-swaps.ts` — NEW: swap request/confirm/reject routes
- `routes/shift-offers.ts` — NEW: offer/claim/retract routes
- `routes/notifications.ts` — NEW: list/mark-read notifications
- `routes/index.ts` — register new routes
- `routes/availability.ts` — extended slot format (time ranges + unavailable)

### Database (`lib/db/src/schema/`)
- `index.ts` — new tables (shift_swaps, shift_offers, notifications) + new columns

### Frontend (`artifacts/web-app/src/`)
- `components/layout.tsx` — show company logo/text instead of SYNTRA
- `pages/settings.tsx` — logo/text logo, currency, timezone dropdown
- `pages/schedule.tsx` — timezone rendering, bulk presets, CSV export/import, iCal, swap/offer UI, suggested badge + approval
- `pages/availability.tsx` — unavailable days toggle, time range input
- `components/notification-bell.tsx` — show swap/offer/suggestion notifications for all roles

---

## Final DB Schema (post-implementation)

See bottom of this document — updated once all features are implemented.
