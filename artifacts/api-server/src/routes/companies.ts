import { Router } from "express";
import { db } from "@workspace/db";
import { companies } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

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
  status: z.enum(["active", "inactive"]).optional(),
  plan: z.enum(["starter", "professional", "enterprise"]).optional(),
});

// GET /api/companies/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  if (id !== req.auth!.companyId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(company);
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
  const [updated] = await db
    .update(companies)
    .set(parsed.data)
    .where(eq(companies.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(updated);
});

export default router;
