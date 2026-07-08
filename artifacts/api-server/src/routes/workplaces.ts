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
  // Accept numbers from the form (coerced to string for numeric DB column)
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  radiusMeters: z.number().int().min(1).optional(),
});

// Drizzle returns `numeric` columns as strings. The OpenAPI contract (and
// generated client types) declare latitude/longitude as `number`, so every
// response must convert them back before serialization.
type WorkplaceRow = typeof workplaces.$inferSelect;
function serializeWorkplace(wp: WorkplaceRow) {
  return {
    ...wp,
    latitude: wp.latitude != null ? Number(wp.latitude) : null,
    longitude: wp.longitude != null ? Number(wp.longitude) : null,
  };
}

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
  res.json(result.map(serializeWorkplace));
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
  const { latitude, longitude, ...rest } = parsed.data;
  const [wp] = await db
    .insert(workplaces)
    .values({
      ...rest,
      latitude: latitude != null ? String(latitude) : null,
      longitude: longitude != null ? String(longitude) : null,
      companyId,
    })
    .returning();
  res.status(201).json(serializeWorkplace(wp));
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
  res.json(serializeWorkplace(wp));
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
  const { latitude, longitude, ...restUpdate } = parsed.data;
  const updateData: Record<string, unknown> = { ...restUpdate };
  if (latitude !== undefined) updateData.latitude = latitude != null ? String(latitude) : null;
  if (longitude !== undefined) updateData.longitude = longitude != null ? String(longitude) : null;
  const [updated] = await db
    .update(workplaces)
    .set(updateData)
    .where(and(eq(workplaces.id, id), eq(workplaces.companyId, companyId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Workplace not found" });
    return;
  }
  res.json(serializeWorkplace(updated));
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
