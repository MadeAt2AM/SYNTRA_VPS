import { Router } from "express";
import { db } from "@workspace/db";
import { workplaces } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const workplaceSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  radiusMeters: z.number().int().min(1).optional(),
});

// GET /api/workplaces
router.get("/", async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const result = await db
    .select()
    .from(workplaces)
    .where(eq(workplaces.companyId, companyId));
  res.json(result);
});

// POST /api/workplaces
router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = workplaceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [wp] = await db
    .insert(workplaces)
    .values({ ...parsed.data, companyId })
    .returning();
  res.status(201).json(wp);
});

// GET /api/workplaces/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [wp] = await db
    .select()
    .from(workplaces)
    .where(and(eq(workplaces.id, id), eq(workplaces.companyId, companyId)))
    .limit(1);
  if (!wp) {
    res.status(404).json({ error: "Workplace not found" });
    return;
  }
  res.json(wp);
});

// PUT /api/workplaces/:id
router.put("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = workplaceSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [updated] = await db
    .update(workplaces)
    .set(parsed.data)
    .where(and(eq(workplaces.id, id), eq(workplaces.companyId, companyId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Workplace not found" });
    return;
  }
  res.json(updated);
});

// DELETE /api/workplaces/:id
router.delete("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [deleted] = await db
    .delete(workplaces)
    .where(and(eq(workplaces.id, id), eq(workplaces.companyId, companyId)))
    .returning({ id: workplaces.id });
  if (!deleted) {
    res.status(404).json({ error: "Workplace not found" });
    return;
  }
  res.status(204).end();
});

export default router;
