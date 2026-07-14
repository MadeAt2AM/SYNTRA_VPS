---
name: SYNTRA custom domain & branded email architecture
description: How per-company custom domains, DNS verification, and branded emails are wired in the SYNTRA workforce app — read before touching company branding, domain, or email code.
---

## Custom domain (company-level white-labeling)
- `companies` table has `customDomain` (unique), `domainStatus` (`none|pending|verified`), `domainVerifiedAt`. Only platform admin can set/change these (`platform.ts`), never exposed on the company-scoped `PUT /api/companies/:id`.
- Verification is a real DNS lookup (Node `dns.promises`, in `artifacts/api-server/src/lib/domain.ts`) checking the domain's CNAME/A record against the platform's own host — this is Syntra's own pre-check, separate from Replit's deployment-level custom domain system.
- `GET /api/public/branding` is an unauthenticated endpoint that resolves company name/logo by `Host` header, but only returns branding when `domainStatus === "verified"` — this prevents someone spoofing branding by pointing DNS at an unclaimed domain without actually owning it.
- **Important distinction to tell users**: getting `domainStatus: verified` in-app only proves the customer's DNS points at Syntra's host. To actually serve their app over that domain with TLS after publishing, the domain must *also* be added in Replit's own Publishing → Domains tab, which issues its own required DNS records (an A record + a `replit-verify` TXT record per domain/subdomain, kept permanently for cert renewal). Multiple domains can attach to one deployment this way — each is a separate entry.

## Branded emails
- All outbound company-context emails route through `renderBrandedEmail(company, innerHtml)` in `artifacts/api-server/src/lib/email-templates.ts` — pass `{ name, logoUrl, logoText }` from the company row, and only the inner body HTML (no outer `<html>`/header, the helper renders the shell).
- System/no-company emails (e.g. the public contact form) intentionally keep hardcoded generic "SYNTRA" branding — there is no company context to brand with.
- **Why**: keeps every company-facing email (invites, password reset, shift swap/offer/replacement) visually consistent with that company's own identity instead of the platform's, without duplicating the HTML shell in every route file.
