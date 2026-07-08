import { Router } from "express";
import { db } from "@workspace/db";
import { invitations, companies } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole, maxGrantableRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import crypto from "crypto";
import { sendEmail, SmtpConfig } from "../lib/email";

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
      email: parsed.data.email,
      role: targetRole,
      invitedBy: userId,
      token,
      expiresAt,
    })
    .returning();

  // Try to send invitation email using company's SMTP config
  try {
    const [company] = await db
      .select({ name: companies.name, smtpConfig: companies.smtpConfig })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company?.smtpConfig) {
      const smtp = company.smtpConfig as SmtpConfig;
      const appUrl = process.env["REPLIT_DEV_DOMAIN"]
        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
        : `${req.protocol}://${req.get("host")}`;
      const inviteUrl = `${appUrl}/register?token=${token}&email=${encodeURIComponent(parsed.data.email)}`;
      const roleLabel = targetRole.charAt(0).toUpperCase() + targetRole.slice(1);

      const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f9f9f9; padding: 40px 0; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; border: 1px solid #e5e5e5;">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background: #e11d48; color: #fff; font-weight: 700; font-size: 18px; letter-spacing: 2px; padding: 10px 18px; border-radius: 8px;">SY</div>
      <h2 style="color: #111; margin: 16px 0 4px; font-size: 22px; font-weight: 700;">SYNTRA</h2>
      <p style="color: #666; font-size: 12px; margin: 0; letter-spacing: 2px; text-transform: uppercase;">Workforce Management</p>
    </div>

    <h3 style="color: #111; font-size: 18px; font-weight: 600; margin: 0 0 12px;">You've been invited to join ${company.name}</h3>
    <p style="color: #444; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      You have been invited to join <strong>${company.name}</strong> on SYNTRA as a <strong>${roleLabel}</strong>.
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

    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
      This invitation expires in 7 days. If you did not expect this invitation, you can ignore this email.
    </p>
  </div>
</body>
</html>`;

      await sendEmail(smtp, parsed.data.email, `You're invited to join ${company.name} on SYNTRA`, html);
    }
  } catch (err) {
    console.error("Failed to send invitation email:", err);
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
