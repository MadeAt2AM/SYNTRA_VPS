/**
 * Shared branded email shell.
 *
 * Every transactional email sent on behalf of a company should visibly
 * carry that company's identity (name + logo when set) rather than a
 * generic SYNTRA-only header, since these emails are delivered from the
 * company's own SMTP/from-address. SYNTRA is credited only as the small
 * "powered by" footer line.
 */

export interface EmailBrandCompany {
  name: string;
  logoUrl?: string | null;
  logoText?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Wraps inner body HTML in a branded card shell. Pass the company that owns
 * the mailbox this is being sent from (or `null` for platform/system emails
 * that are not tied to any single company, e.g. the marketing contact form).
 */
export function renderBrandedEmail(company: EmailBrandCompany | null, bodyHtml: string): string {
  const brandName = company?.name ? escapeHtml(company.name) : "SYNTRA";
  const badge = company?.logoUrl
    ? `<img src="${escapeHtml(company.logoUrl)}" alt="${brandName}" style="max-height:44px;max-width:200px;display:inline-block;" />`
    : `<div style="display:inline-block;background:#e11d48;color:#fff;font-weight:700;font-size:16px;letter-spacing:1px;padding:10px 16px;border-radius:8px;">${escapeHtml(
        company?.logoText || (company ? initials(company.name) : "SY"),
      )}</div>`;

  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, Helvetica, Arial, sans-serif; background: #f4f4f5; padding: 40px 0; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; border: 1px solid #e5e5e5;">
    <div style="text-align: center; margin-bottom: 28px;">
      ${badge}
      <h2 style="color: #111; margin: 14px 0 0; font-size: 20px; font-weight: 700;">${brandName}</h2>
    </div>
    ${bodyHtml}
    <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0 16px;" />
    <p style="color: #aaa; font-size: 11px; text-align: center; margin: 0; letter-spacing: 0.3px;">
      ${company ? `Sent by ${brandName} &middot; ` : ""}Powered by SYNTRA Workforce Management
    </p>
  </div>
</body>
</html>`;
}

export { escapeHtml };
