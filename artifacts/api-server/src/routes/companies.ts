import { Router } from "express";
import { db } from "@workspace/db";
import { companies } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import { testSmtp } from "../lib/email";

const router = Router();
router.use(requireAuth);

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  timezone: z.string().optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
  overtimeThreshold: z.string().optional(),
  logoUrl: z.string().optional().nullable(),
  logoText: z.string().optional().nullable(),
  currency: z.string().min(1).max(10).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  plan: z.enum(["starter", "professional", "enterprise"]).optional(),
});

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().min(1),
});

// Only the admin (who is the only role allowed to configure SMTP) should ever see the
// plaintext SMTP password back — managers/employees calling this same endpoint for
// company profile info (currency, logo, timezone, etc.) must not receive it.
function sanitizeCompanyForRole<T extends { smtpConfig: unknown }>(company: T, role: string | undefined) {
  if (role === "admin") return company;
  const cfg = company.smtpConfig as { host?: string; port?: number; secure?: boolean; user?: string; from?: string } | null;
  const { smtpConfig, ...rest } = company;
  return {
    ...rest,
    smtpConfig: cfg ? { host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, from: cfg.from, configured: true } : null,
  };
}

// GET /api/companies/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  if (id !== req.auth!.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(sanitizeCompanyForRole(company, req.auth!.role));
});

// PUT /api/companies/:id — admin only
router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  if (id !== req.auth!.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = updateCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [updated] = await db.update(companies).set(parsed.data).where(eq(companies.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(sanitizeCompanyForRole(updated, req.auth!.role));
});

// PUT /api/companies/:id/smtp — save SMTP config (admin only)
router.put("/:id/smtp", requireRole("admin"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  if (id !== req.auth!.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = smtpConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [updated] = await db
    .update(companies)
    .set({ smtpConfig: parsed.data as any })
    .where(eq(companies.id, id))
    .returning({ id: companies.id, smtpConfig: companies.smtpConfig });
  res.json({ success: true, smtpConfig: updated.smtpConfig });
});

// POST /api/companies/:id/smtp/test — test SMTP connection (admin only)
router.post("/:id/smtp/test", requireRole("admin"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  if (id !== req.auth!.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = smtpConfigSchema.safeParse(req.body);
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

export default router;
