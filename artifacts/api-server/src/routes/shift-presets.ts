import { Router } from "express";
import { db } from "@workspace/db";
import { shiftPresets } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const presetSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
});

// GET /api/shift-presets
router.get("/", async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const result = await db
    .select()
    .from(shiftPresets)
    .where(eq(shiftPresets.companyId, companyId))
    .orderBy(shiftPresets.createdAt);
  res.json(result);
});

// POST /api/shift-presets
router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = presetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [preset] = await db
    .insert(shiftPresets)
    .values({ companyId, ...parsed.data })
    .returning();
  res.status(201).json(preset);
});

// DELETE /api/shift-presets/:id
router.delete("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [deleted] = await db
    .delete(shiftPresets)
    .where(and(eq(shiftPresets.id, id), eq(shiftPresets.companyId, companyId)))
    .returning({ id: shiftPresets.id });
  if (!deleted) {
    res.status(404).json({ error: "Preset not found" });
    return;
  }
  res.status(204).end();
});

export default router;
