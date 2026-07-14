import { Router } from "express";
import { db } from "@workspace/db";
import { invitations, companies } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole, maxGrantableRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import crypto from "crypto";
import { sendEmail, SmtpConfig } from "../lib/email";
import { renderBrandedEmail } from "../lib/email-templates";
import { emailEq, normalizeEmail } from "../lib/email-normalize";

const router = Router();
router.use(requireAuth);

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "employee"]).optional(),
  expiresAt: z.string().optional(),
});

// GET /api/invitations
router.get("/", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const result = await db
    .select()
    .from(invitations)
    .where(eq(invitations.companyId, companyId));
  res.json(result);
});

// POST /api/invitations
router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { companyId, userId, role: callerRole } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = createInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const targetRole = parsed.data.role ?? "employee";

  const grantable = maxGrantableRole(callerRole);
  if (!grantable.includes(targetRole as (typeof grantable)[number])) {
    res.status(403).json({
      error: `Your role (${callerRole}) cannot invite someone as ${targetRole}`,
    });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [inv] = await db
    .insert(invitations)
    .values({
      companyId,
      email: normalizeEmail(parsed.data.email),
      role: targetRole,
      invitedBy: userId,
      token,
      expiresAt,
    })
    .returning();

  // Try to send invitation email using company's SMTP config
  try {
    const [company] = await db
      .select({ name: companies.name, smtpConfig: companies.smtpConfig, logoUrl: companies.logoUrl, logoText: companies.logoText })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company?.smtpConfig) {
      const smtp = company.smtpConfig as SmtpConfig;
      const appUrl = process.env["REPLIT_DEV_DOMAIN"]
        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
        : `${req.protocol}://${req.get("host")}`;
      const inviteUrl = `${appUrl}/accept-invite?token=${token}&email=${encodeURIComponent(parsed.data.email)}`;
      const roleLabel = targetRole.charAt(0).toUpperCase() + targetRole.slice(1);

      const html = renderBrandedEmail(
        { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
        `
    <h3 style="color: #111; font-size: 18px; font-weight: 600; margin: 0 0 12px;">You've been invited to join ${company.name}</h3>
    <p style="color: #444; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      You have been invited to join <strong>${company.name}</strong> as a <strong>${roleLabel}</strong>.
      Click the button below to set up your account and get started.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${inviteUrl}" style="display: inline-block; background: #e11d48; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 8px;">
        Accept Invitation
      </a>
    </div>

    <p style="color: #888; font-size: 13px; line-height: 1.6; margin: 0 0 8px;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="color: #666; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px 12px; border-radius: 6px; margin: 0 0 24px;">${inviteUrl}</p>

    <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
      This invitation expires in 7 days. If you did not expect this invitation, you can ignore this email.
    </p>`,
      );

      await sendEmail(smtp, parsed.data.email, `You're invited to join ${company.name}`, html);
    }
  } catch (err) {
    req.log?.warn({ err }, "Failed to send invitation email");
  }

  res.status(201).json(inv);
});

// GET /api/invitations/:id
router.get("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.companyId, companyId)))
    .limit(1);
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  res.json(inv);
});

// POST /api/invitations/:id/resend — generate a fresh token + expiry and resend the email
router.post("/:id/resend", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }

  const [existing] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.companyId, companyId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  // Mirror the same privilege boundary enforced on creation: a caller may
  // only resend (and thus keep alive) invitations for roles they're allowed
  // to grant. Without this, e.g. a manager could regenerate a live token for
  // a pending admin invitation they didn't create.
  const { role: callerRole } = req.auth!;
  if (!maxGrantableRole(callerRole).includes(existing.role as any)) {
    res.status(403).json({ error: "You are not permitted to resend an invitation for this role" });
    return;
  }

  // Only invitations that are still actionable should be revivable — do not
  // let a resend silently reopen an invite that was already accepted or
  // explicitly revoked/cancelled.
  if (existing.status !== "pending" && existing.status !== "expired") {
    res.status(400).json({ error: `Cannot resend an invitation with status "${existing.status}"` });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [inv] = await db
    .update(invitations)
    .set({ token, expiresAt, status: "pending" })
    .where(eq(invitations.id, id))
    .returning();

  // Try to resend invitation email using company's SMTP config
  try {
    const [company] = await db
      .select({ name: companies.name, smtpConfig: companies.smtpConfig, logoUrl: companies.logoUrl, logoText: companies.logoText })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company?.smtpConfig) {
      const smtp = company.smtpConfig as SmtpConfig;
      const appUrl = process.env["REPLIT_DEV_DOMAIN"]
        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
        : `${req.protocol}://${req.get("host")}`;
      const inviteUrl = `${appUrl}/accept-invite?token=${token}&email=${encodeURIComponent(inv.email)}`;
      const roleLabel = inv.role.charAt(0).toUpperCase() + inv.role.slice(1);

      const html = renderBrandedEmail(
        { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
        `
    <h3 style="color: #111; font-size: 18px; font-weight: 600; margin: 0 0 12px;">You've been invited to join ${company.name}</h3>
    <p style="color: #444; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      This is a fresh invitation link to join <strong>${company.name}</strong> as a <strong>${roleLabel}</strong>.
      Click the button below to set up your account and get started.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${inviteUrl}" style="display: inline-block; background: #e11d48; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 8px;">
        Accept Invitation
      </a>
    </div>

    <p style="color: #888; font-size: 13px; line-height: 1.6; margin: 0 0 8px;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="color: #666; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px 12px; border-radius: 6px; margin: 0 0 24px;">${inviteUrl}</p>

    <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
      This invitation expires in 7 days. Any previous invitation link for this address is now invalid.
    </p>`,
      );

      await sendEmail(smtp, inv.email, `Your invitation to join ${company.name} (resent)`, html);
    }
  } catch (err) {
    req.log?.warn({ err }, "Failed to resend invitation email");
  }

  res.json(inv);
});

// DELETE /api/invitations/:id
router.delete("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [deleted] = await db
    .delete(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.companyId, companyId)))
    .returning({ id: invitations.id });
  if (!deleted) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  res.status(204).end();
});

export default router;
