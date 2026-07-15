# SYNTRA company lifecycle and custom-domain tenancy

## Authentication boundary

A verified custom domain is bound to one company. Login succeeds only when:

- the user account is active;
- a tenant user belongs to an active company; and
- on a verified custom domain, the user's `company_id` matches the company that owns that hostname.

Platform administrators can sign in only through the platform hostname. Rejected custom-domain logins return `401 {"error":"Invalid user"}` without issuing a token.

## Company lifecycle

- **Deactivate:** sets `companies.status = 'inactive'`. The company and all tenant data stay in PostgreSQL. Users cannot sign in. The platform dashboard keeps the company visible and greys out the row. The same control can reactivate it.
- **Delete:** permanently deletes the company row. PostgreSQL `ON DELETE CASCADE` constraints remove users, workplaces, shifts, availability, leave requests, time logs, shift presets, invitations, shift swaps, shift offers, shift replacements, and notifications owned by that company.

Deletion requires an explicit destructive confirmation in the platform dashboard and cannot be restored.

## Existing records

Rows previously soft-deleted by the old DELETE endpoint already have `status = 'inactive'`. No destructive data migration is required: they remain inactive and visible in the dashboard after this release.
