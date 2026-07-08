/**
 * Platform-admin routes — /api/platform/*
 * Only accessible by users with role = "platform_admin".
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { companies, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requirePlatformAdmin, signToken } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

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
});

/** GET /api/platform/companies */
router.get("/companies", async (_req, res) => {
  const result = await db
    .select({
      id: companies.id,
      name: companies.name,
      status: companies.status,
      plan: companies.plan,
      timezone: companies.timezone,
      createdAt: companies.createdAt,
    })
    .from(companies);
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

  // Check email not already in use
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
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
      email: ownerEmail,
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

  res.status(201).json({ company, owner });
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
  res.json({ ...company, users: companyUsers });
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
  const [updated] = await db.update(companies).set(parsed.data).where(eq(companies.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(updated);
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

// ─── Contact enquiries ────────────────────────────────────────────────────────

router.get("/enquiries", async (_req, res) => {
  res.json([]);
});

export default router;
