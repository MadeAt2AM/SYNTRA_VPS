import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, invitations, companies } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, signToken } from "../middlewares/auth";
import { sendEmail, SmtpConfig } from "../lib/email";
import { emailEq, normalizeEmail } from "../lib/email-normalize";
import { loginIpLimiter, loginEmailLimiter } from "../middlewares/rate-limit";
import { renderBrandedEmail } from "../lib/email-templates";
import { buildCustomDomainUrl, isKnownCustomDomain, normalizeDomain } from "../lib/domain";
import { isLoginAllowed } from "../lib/login-access";
import { z } from "zod";

const router = Router();

/**
 * If the user's company has a verified `customDomain` that differs from the
 * host the request came in on, return the absolute URL on that custom domain
 * that the client should bounce to after this auth handshake completes.
 *
 * The `redirectTo` is ONLY populated when:
 *   - the company row has `customDomain` set + `domainStatus === "verified"` AND
 *   - the request's Host differs from that customDomain AND
 *   - the destination host is in `getCustomDomainHosts()` (open-redirect guard)
 *
 * Returns `null` in every other case so callers can fall back to in-app routing.
 */
function resolvePostAuthRedirect(
  reqHost: string,
  company: { customDomain: string | null; domainStatus: string | null } | undefined | null,
  destPath: string,
): string | null {
  if (!company?.customDomain || company.domainStatus !== "verified") return null;
  const target = normalizeDomain(company.customDomain);
  if (!target || normalizeDomain(reqHost) === target) return null;
  return buildCustomDomainUrl(target, destPath);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
  companyName: z.string().min(1).optional(),
  invitationToken: z.string().min(1).optional(),
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  // Normalize case so "User@Acme.com" and "user@acme.com" are treated as the
  // same identity everywhere (uniqueness check, storage, invitation match).
  const email = normalizeEmail(parsed.data.email);
  const { password, name, companyName, invitationToken } = parsed.data;

  if (!companyName && !invitationToken) {
    res.status(400).json({
      error: "Provide either companyName (to create a new company) or invitationToken (to join via invitation)",
    });
    return;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // ── Invitation flow ────────────────────────────────────────────────────
  if (invitationToken) {
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, invitationToken))
      .limit(1);

    if (!invitation) {
      res.status(400).json({ error: "This invitation link is invalid." });
      return;
    }
    if (invitation.status !== "pending") {
      res.status(400).json({ error: "This invitation has already been used or was revoked." });
      return;
    }
    if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: "This invitation has expired. Ask an admin or manager to resend it." });
      return;
    }
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      res.status(400).json({ error: "This invitation was issued to a different email address." });
      return;
    }
    if (!invitation.companyId) {
      res.status(400).json({ error: "This invitation is not associated with a company." });
      return;
    }

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        role: invitation.role,
        companyId: invitation.companyId,
      })
      .returning();

    await db
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.id, invitation.id));

    const token = signToken({ userId: user.id, companyId: user.companyId, role: user.role });

    let redirectTo: string | null = null;
    const [company] = await db
      .select({ customDomain: companies.customDomain, domainStatus: companies.domainStatus })
      .from(companies)
      .where(eq(companies.id, user.companyId!))
      .limit(1);
    redirectTo = resolvePostAuthRedirect(req.hostname || "", company, "/dashboard");

    res.status(201).json({
      token,
      redirectTo,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
    });
    return;
  }

  // ── New company flow — caller becomes the admin/owner ─────────────────
  const [company] = await db
    .insert(companies)
    .values({ name: companyName! })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      role: "admin",
      companyId: company.id,
    })
    .returning();

  const token = signToken({ userId: user.id, companyId: user.companyId, role: user.role });
  const redirectTo = resolvePostAuthRedirect(req.hostname || "", company, "/dashboard");
  res.status(201).json({
    token,
    redirectTo,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    },
  });
});

// POST /api/auth/login
router.post("/login", loginIpLimiter, loginEmailLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email: rawEmail, password } = parsed.data;
  const email = normalizeEmail(rawEmail);

  const [user] = await db
    .select({
      id: users.id,
      companyId: users.companyId,
      email: users.email,
      passwordHash: users.passwordHash,
      name: users.name,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      companyStatus: companies.status,
    })
    .from(users)
    .leftJoin(companies, eq(companies.id, users.companyId))
    .where(emailEq(users.email, email))
    .limit(1);

  if (!user) {
    await bcrypt.compare(
      password,
      "$2b$12$invalidhashpaddingtomatchtime00000000000000000000000000",
    );
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.status !== "active") {
    res.status(403).json({ error: "Account is not active" });
    return;
  }

  const requestHost = normalizeDomain(req.hostname || "");
  let customDomainCompanyId: number | null = null;
  if (isKnownCustomDomain(requestHost)) {
    const [domainCompany] = await db
      .select({ id: companies.id, domainStatus: companies.domainStatus })
      .from(companies)
      .where(eq(companies.customDomain, requestHost))
      .limit(1);
    // A served custom host with no verified owner must fail closed.
    customDomainCompanyId = domainCompany?.domainStatus === "verified" ? domainCompany.id : -1;
  }

  if (!isLoginAllowed({
    userRole: user.role,
    userCompanyId: user.companyId,
    userCompanyStatus: user.companyStatus,
    customDomainCompanyId,
  })) {
    res.status(401).json({ error: "Invalid user" });
    return;
  }

  const token = signToken({
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
  });

  // If the user's company has a verified customDomain and the request came
  // in on a different host (typically the platform's own syntra.terrybot.top),
  // tell the client to bounce to the company's own URL so the rest of the
  // session — token storage, branding, password-reset links, etc. — happens
  // on the customer's white-label origin.
  let redirectTo: string | null = null;
  if (user.companyId) {
    const [company] = await db
      .select({ customDomain: companies.customDomain, domainStatus: companies.domainStatus })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1);
    redirectTo = resolvePostAuthRedirect(req.hostname || "", company, "/dashboard");
  }

  res.json({
    token,
    redirectTo,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      companyId: users.companyId,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      hourlyRate: users.hourlyRate,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, req.auth!.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

// POST /api/auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.auth!.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (parsed.data.currentPassword && !user.mustChangePassword) {
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const [updated] = await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, req.auth!.userId))
    .returning({ id: users.id, mustChangePassword: users.mustChangePassword });

  res.json({ success: true, mustChangePassword: updated.mustChangePassword });
});

// Derive the trusted app base URL from environment (never from request headers).
// In Replit, REPLIT_DOMAINS is a comma-separated list of public domains.
function getAppBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const explicitBase = process.env["APP_BASE_URL"];
  if (explicitBase) return explicitBase.replace(/\/$/, "");
  // Last-resort dev fallback (non-public, same-host guess — acceptable for local dev only)
  return `http://localhost:${process.env["PORT"] ?? 8080}`;
}

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  const email = normalizeEmail(parsed.data.email);

  // Always respond 200 so we don't reveal whether an account exists
  const [user] = await db
    .select()
    .from(users)
    .where(emailEq(users.email, email))
    .limit(1);

  if (user) {
    // Generate a random token and store only its SHA-256 hash in the DB.
    // The raw token is sent in the email; a DB leak won't expose usable tokens.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await db
      .update(users)
      .set({ passwordResetToken: hashedToken, passwordResetExpiry: expiry })
      .where(eq(users.id, user.id));

    // Attempt to send email using the company's SMTP config
    if (user.companyId) {
      const [company] = await db
        .select({ name: companies.name, smtpConfig: companies.smtpConfig, logoUrl: companies.logoUrl, logoText: companies.logoText })
        .from(companies)
        .where(eq(companies.id, user.companyId))
        .limit(1);

      const smtp = company?.smtpConfig as SmtpConfig | null;
      if (smtp?.host && company) {
        const origin = getAppBaseUrl();
        const resetUrl = `${origin}/reset-password?token=${rawToken}`;

        const html = renderBrandedEmail(
          { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
          `
          <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${user.name},</p>
          <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 24px;">You requested a password reset for your <strong>${company.name}</strong> account.</p>
          <div style="text-align:center;margin:0 0 24px;">
            <a href="${resetUrl}" style="background:#e11d48;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Reset Password</a>
          </div>
          <p style="color:#888;font-size:13px;line-height:1.6;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          `,
        );

        try {
          await sendEmail(smtp, user.email, `Reset your ${company.name} password`, html);
        } catch (err) {
          req.log?.warn({ err }, "Failed to send password reset email");
        }
      }
    }
  }

  res.json({ message: "If an account with that email exists, a reset link has been sent." });
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const parsed = z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { token, newPassword } = parsed.data;

  // Hash the incoming raw token and look up the hashed value in the DB
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.passwordResetToken, hashedToken))
    .limit(1);

  if (!user || !user.passwordResetExpiry || new Date(user.passwordResetExpiry).getTime() < Date.now()) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(users)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
      mustChangePassword: false,
    })
    .where(eq(users.id, user.id));

  res.json({ success: true });
});

export default router;
