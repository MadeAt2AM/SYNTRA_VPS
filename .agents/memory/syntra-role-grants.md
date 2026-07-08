---
name: SYNTRA invitation role-grant enforcement
description: Any endpoint that creates, resends, or otherwise revives an invitation must enforce maxGrantableRole, not just creation.
---

Invitation privilege boundaries in the SYNTRA api-server are enforced via `maxGrantableRole(callerRole)` (see `artifacts/api-server/src/middlewares/auth.ts`). Admin can grant manager/employee; manager can grant employee only; platform_admin can grant anything.

**Why:** When a resend-invitation endpoint was added, it initially forgot this check — a manager could regenerate a live token for a pending admin/manager invitation they had no authority to create, which is a role-escalation path. Caught in code review, not before.

**How to apply:** Any new invitation-related mutation (resend, re-activate, edit role, etc.) must re-check `maxGrantableRole(callerRole).includes(existingInvitation.role)` against the invitation's *current* role, in addition to whatever the creation endpoint already enforces. Also restrict such actions to invitations still in an actionable status (`pending`/`expired`) — never silently revive `accepted` or explicitly cancelled invitations.
