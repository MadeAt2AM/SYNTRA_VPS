/**
 * Platform-admin routes — /api/platform/*
 * Only accessible by users with role = "platform_admin".
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { companies, users, platformSettings } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { requireAuth, requirePlatformAdmin, signToken } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import { normalizeDomain, isValidHostname, checkDomainDns, getPlatformTargets } from "../lib/domain";
import { sendEmail, testSmtp, type SmtpConfig } from "../lib/email";
import { emailEq, normalizeEmail } from "../lib/email-normalize";
import { renderBrandedEmail } from "../lib/email-templates";

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

// ─── Companies ───────────────────────────────────────────────────────────────

const createCompanySchema = z.object({
  name: z.string().min(1),
  ownerName: z.string().min(1),
  ownerEmail: z.string().email(),
  ownerTempPassword: z.string().min(6),
  plan: z.enum(["starter", "professional", "enterprise"]).optional(),
  timezone: z.string().optional(),
});

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  plan: z.enum(["starter", "professional", "enterprise"]).optional(),
  timezone: z.string().optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  overtimeThreshold: z.string().optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
  logoUrl: z.string().optional().nullable(),
  logoText: z.string().optional().nullable(),
  currency: z.string().min(1).max(10).optional(),
  // Custom domain: send `""` or `null` to remove it.
  customDomain: z.string().optional().nullable(),
});

const addAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  tempPassword: z.string().min(6),
});

const addPlatformAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  tempPassword: z.string().min(6),
});

const platformSmtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().min(1),
});

const platformSettingsSchema = z.object({
  smtp: platformSmtpSchema.optional().nullable(),
  contactEmailTo: z.string().email().optional().nullable(),
  contactEmailFrom: z.string().min(1).optional().nullable(),
});

/** GET /api/platform/companies
 *  Pass `?includeInactive=true` to also return soft-deleted companies
 *  (status='inactive'). Default behaviour hides them so the platform admin
 *  dashboard doesn't accumulate zombie rows after a "Delete" action.
 */
router.get("/companies", async (req, res) => {
  const includeInactive = req.query["includeInactive"] === "true";
  const where = includeInactive ? undefined : eq(companies.status, "active");
  const result = await db
    .select({
      id: companies.id,
      name: companies.name,
      status: companies.status,
      plan: companies.plan,
      timezone: companies.timezone,
      customDomain: companies.customDomain,
      domainStatus: companies.domainStatus,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .where(where as any)
    .orderBy(sql`${companies.createdAt} desc nulls last`);
  res.json(result);
});

/**
 * POST /api/platform/companies
 * Creates a company and an owner user with a temp password.
 * Owner must change password on first login.
 */
router.post("/companies", async (req, res) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, ownerName, ownerEmail, ownerTempPassword, plan, timezone } = parsed.data;
  const normalizedOwnerEmail = normalizeEmail(ownerEmail);

  // Check email not already in use
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(emailEq(users.email, normalizedOwnerEmail))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const [company] = await db
    .insert(companies)
    .values({ name, plan: plan ?? "starter", timezone: timezone ?? "UTC" })
    .returning();

  const passwordHash = await bcrypt.hash(ownerTempPassword, 12);
  const [owner] = await db
    .insert(users)
    .values({
      companyId: company.id,
      email: normalizedOwnerEmail,
      name: ownerName,
      passwordHash,
      role: "admin",
      mustChangePassword: true,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
    });

  res.status(201).json({
    company,
    owner,
    // Echo the plaintext temp password back exactly once so the platform
    // admin can share it with the new tenant owner. It is never stored in
    // plaintext (only bcrypt-hashed in users.password_hash) and never
    // re-served by GET endpoints.
    tempPassword: ownerTempPassword,
  });
});

/** GET /api/platform/companies/:id */
router.get("/companies/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const companyUsers = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.companyId, id));
  // Never expose a tenant's plaintext SMTP password to the platform admin panel.
  const cfg = company.smtpConfig as { host?: string; port?: number; secure?: boolean; user?: string; from?: string } | null;
  const { smtpConfig, ...rest } = company;
  res.json({
    ...rest,
    smtpConfig: cfg ? { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, from: cfg.from, configured: true } : null,
    users: companyUsers,
  });
});

/** PUT /api/platform/companies/:id */
router.put("/companies/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const parsed = updateCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { customDomain: rawDomain, ...rest } = parsed.data;
  const updateValues: Record<string, unknown> = { ...rest };

  if (rawDomain !== undefined) {
    if (rawDomain === null || rawDomain.trim() === "") {
      // Clearing the domain — reset verification state too.
      updateValues["customDomain"] = null;
      updateValues["domainStatus"] = "none";
      updateValues["domainVerifiedAt"] = null;
    } else {
      const domain = normalizeDomain(rawDomain);
      if (!isValidHostname(domain)) {
        res.status(400).json({ error: `"${rawDomain}" is not a valid domain name` });
        return;
      }
      const [conflict] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.customDomain, domain), ne(companies.id, id)))
        .limit(1);
      if (conflict) {
        res.status(409).json({ error: "That domain is already in use by another company" });
        return;
      }
      updateValues["customDomain"] = domain;
      updateValues["domainStatus"] = "pending";
      updateValues["domainVerifiedAt"] = null;
    }
  }

  const [updated] = await db.update(companies).set(updateValues).where(eq(companies.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(updated);
});

/**
 * GET /api/platform/companies/:id/domain/dns-instructions
 * Returns the CNAME record the customer needs to create, and the current
 * platform host(s) so the frontend can render setup instructions.
 */
router.get("/companies/:id/domain/dns-instructions", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const [company] = await db
    .select({ customDomain: companies.customDomain, domainStatus: companies.domainStatus })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const targets = getPlatformTargets();
  res.json({
    customDomain: company.customDomain,
    domainStatus: company.domainStatus,
    recordType: "CNAME",
    target: targets[0] ?? null,
    allTargets: targets,
  });
});

/**
 * POST /api/platform/companies/:id/domain/verify
 * Actively checks DNS for the company's custom domain and updates its
 * verification status accordingly.
 */
router.post("/companies/:id/domain/verify", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const [company] = await db
    .select({ customDomain: companies.customDomain })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  if (!company.customDomain) {
    res.status(400).json({ error: "This company has no custom domain configured yet" });
    return;
  }

  const result = await checkDomainDns(company.customDomain);
  const [updated] = await db
    .update(companies)
    .set({
      domainStatus: result.verified ? "verified" : "pending",
      domainVerifiedAt: result.verified ? new Date() : null,
    })
    .where(eq(companies.id, id))
    .returning({ id: companies.id, customDomain: companies.customDomain, domainStatus: companies.domainStatus, domainVerifiedAt: companies.domainVerifiedAt });

  res.json({ ...updated, checkDetail: result.detail, method: result.method });
});

/** DELETE /api/platform/companies/:id — soft delete */
router.delete("/companies/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const [updated] = await db
    .update(companies)
    .set({ status: "inactive" })
    .where(eq(companies.id, id))
    .returning({ id: companies.id, name: companies.name, status: companies.status });
  if (!updated) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(updated);
});

/**
 * POST /api/platform/companies/:id/admins
 * Platform admins can grant additional admin (owner-level) accounts to an
 * existing company. This is intentionally NOT available from the in-app
 * invitation screen — company admins cannot self-escalate a teammate to
 * admin; only the platform operator can.
 */
router.post("/companies/:id/admins", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const parsed = addAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, email, tempPassword } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const [admin] = await db
    .insert(users)
    .values({
      companyId: id,
      email: normalizedEmail,
      name,
      passwordHash,
      role: "admin",
      mustChangePassword: true,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
    });

  // Best-effort welcome email via the company's own SMTP config, branded
  // with their name/logo, so the new admin's first touchpoint already
  // looks like it came from their employer rather than a generic system.
  try {
    const smtp = company.smtpConfig as SmtpConfig | null;
    if (smtp?.host) {
      const html = renderBrandedEmail(
        { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
        `
        <h3 style="color:#111;font-size:18px;font-weight:600;margin:0 0 12px;">You've been added as an admin for ${company.name}</h3>
        <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 20px;">
          A platform administrator has created an admin account for you on <strong>${company.name}</strong>'s SYNTRA workspace.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr><td style="padding:8px;background:#f5f5f5;border-radius:6px 0 0 6px;font-size:13px;color:#666;">Email</td><td style="padding:8px;font-size:14px;font-weight:600;">${email}</td></tr>
          <tr><td style="padding:8px;font-size:13px;color:#666;">Temporary password</td><td style="padding:8px;font-size:14px;font-weight:600;">${tempPassword}</td></tr>
        </table>
        <p style="color:#888;font-size:13px;line-height:1.6;">You'll be asked to set a new password the first time you sign in.</p>
        `,
      );
      await sendEmail(smtp, email, `You're an admin for ${company.name} on SYNTRA`, html);
    }
  } catch (err) {
    req.log?.warn({ err }, "Failed to send new-admin welcome email");
  }

  res.status(201).json({
    ...admin,
    // Echo the plaintext temp password back exactly once so the platform
    // admin can share it. Never stored in plaintext, never re-served.
    tempPassword,
  });
});

/**
 * POST /api/platform/admins
 * Platform admins can create additional platform-admin accounts, which have
 * the same master-console access (all companies, settings, impersonation).
 * These users have no companyId — they are not scoped to any tenant.
 */
router.post("/admins", async (req, res) => {
  const parsed = addPlatformAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, email, tempPassword } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const [existing] = await db.select({ id: users.id }).from(users).where(emailEq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const [admin] = await db
    .insert(users)
    .values({
      companyId: null,
      email: normalizedEmail,
      name,
      passwordHash,
      role: "platform_admin",
      mustChangePassword: true,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
    });

  res.status(201).json(admin);
});

/** GET /api/platform/admins — list all platform-admin accounts */
router.get("/admins", async (_req, res) => {
  const result = await db
    .select({ id: users.id, email: users.email, name: users.name, status: users.status, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.role, "platform_admin"));
  res.json(result);
});

// ─── Platform Settings (site-wide SMTP for the public contact form) ──────────

async function getOrCreatePlatformSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(platformSettings).values({ id: 1 }).returning();
  return created;
}

/** GET /api/platform/settings */
router.get("/settings", async (_req, res) => {
  const settings = await getOrCreatePlatformSettings();
  const cfg = settings.smtpConfig as { host?: string; port?: number; secure?: boolean; user?: string; from?: string } | null;
  res.json({
    smtp: cfg ? { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, from: cfg.from, configured: true } : null,
    contactEmailTo: settings.contactEmailTo,
    contactEmailFrom: settings.contactEmailFrom,
  });
});

/** PUT /api/platform/settings */
router.put("/settings", async (req, res) => {
  const parsed = platformSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await getOrCreatePlatformSettings();
  const updateValues: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.smtp !== undefined) updateValues["smtpConfig"] = parsed.data.smtp;
  if (parsed.data.contactEmailTo !== undefined) updateValues["contactEmailTo"] = parsed.data.contactEmailTo;
  if (parsed.data.contactEmailFrom !== undefined) updateValues["contactEmailFrom"] = parsed.data.contactEmailFrom;

  const [updated] = await db.update(platformSettings).set(updateValues).where(eq(platformSettings.id, 1)).returning();
  const cfg = updated.smtpConfig as { host?: string; port?: number; secure?: boolean; user?: string; from?: string } | null;
  res.json({
    smtp: cfg ? { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, from: cfg.from, configured: true } : null,
    contactEmailTo: updated.contactEmailTo,
    contactEmailFrom: updated.contactEmailFrom,
  });
});

/** POST /api/platform/settings/test-smtp */
router.post("/settings/test-smtp", async (req, res) => {
  const parsed = platformSmtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await testSmtp(parsed.data);
    res.json({ success: true, message: "SMTP connection verified" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "SMTP connection failed" });
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────

router.get("/users", async (_req, res) => {
  const result = await db
    .select({ id: users.id, companyId: users.companyId, email: users.email, name: users.name, role: users.role, status: users.status, createdAt: users.createdAt })
    .from(users);
  res.json(result);
});

router.get("/users/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { passwordHash: _, ...safe } = user;
  res.json(safe);
});

// ─── Stats ───────────────────────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  const allCompanies = await db.select({ id: companies.id, status: companies.status }).from(companies);
  const allUsers = await db.select({ id: users.id, role: users.role, companyId: users.companyId }).from(users);
  res.json({
    companies: {
      total: allCompanies.length,
      active: allCompanies.filter((c) => c.status === "active").length,
      inactive: allCompanies.filter((c) => c.status !== "active").length,
    },
    users: {
      total: allUsers.filter((u) => u.companyId !== null).length,
      platformAdmins: allUsers.filter((u) => u.role === "platform_admin").length,
      owners: allUsers.filter((u) => u.role === "admin").length,
      managers: allUsers.filter((u) => u.role === "manager").length,
      employees: allUsers.filter((u) => u.role === "employee").length,
    },
  });
});

router.post("/impersonate/:userId", async (req, res) => {
  const id = parseId(req.params["userId"], res, "userId");
  if (id === null) return;
  const [user] = await db
    .select({ id: users.id, companyId: users.companyId, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const token = signToken({ userId: user.id, companyId: user.companyId, role: user.role });
  res.json({ token, userId: user.id, role: user.role, companyId: user.companyId });
});

export default router;
