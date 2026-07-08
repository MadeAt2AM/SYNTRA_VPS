import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, users, workplaces } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const shiftSchema = z.object({
  employeeId: z.number().int().positive().optional().nullable(),
  workplaceId: z.number().int().positive().optional().nullable(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  status: z.enum(["draft", "published", "cancelled"]).optional(),
  offerStatus: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/** Validate that an employee and/or workplace belong to the company. */
async function validateCrossRefs(
  companyId: number,
  employeeId: number | null | undefined,
  workplaceId: number | null | undefined,
): Promise<string | null> {
  if (employeeId != null) {
    const [emp] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, employeeId), eq(users.companyId, companyId)))
      .limit(1);
    if (!emp) return `Employee ${employeeId} not found in this company`;
  }
  if (workplaceId != null) {
    const [wp] = await db
      .select({ id: workplaces.id })
      .from(workplaces)
      .where(
        and(eq(workplaces.id, workplaceId), eq(workplaces.companyId, companyId)),
      )
      .limit(1);
    if (!wp) return `Workplace ${workplaceId} not found in this company`;
  }
  return null;
}

// GET /api/shifts
router.get("/", async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const result = await db
    .select()
    .from(shifts)
    .where(eq(shifts.companyId, companyId));
  res.json(result);
});

// POST /api/shifts
router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = shiftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const crossRefError = await validateCrossRefs(
    companyId,
    parsed.data.employeeId,
    parsed.data.workplaceId,
  );
  if (crossRefError) {
    res.status(400).json({ error: crossRefError });
    return;
  }
  const { startTime, endTime, ...rest } = parsed.data;
  const [shift] = await db
    .insert(shifts)
    .values({
      ...rest,
      companyId,
      createdBy: userId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    })
    .returning();
  res.status(201).json(shift);
});

// GET /api/shifts/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, id), eq(shifts.companyId, companyId)))
    .limit(1);
  if (!shift) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  res.json(shift);
});

// PUT /api/shifts/:id
router.put("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = shiftSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const crossRefError = await validateCrossRefs(
    companyId,
    parsed.data.employeeId,
    parsed.data.workplaceId,
  );
  if (crossRefError) {
    res.status(400).json({ error: crossRefError });
    return;
  }
  const { startTime, endTime, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (startTime) updates.startTime = new Date(startTime);
  if (endTime) updates.endTime = new Date(endTime);

  const [updated] = await db
    .update(shifts)
    .set(updates)
    .where(and(eq(shifts.id, id), eq(shifts.companyId, companyId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  res.json(updated);
});

// DELETE /api/shifts/:id
router.delete("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [deleted] = await db
    .delete(shifts)
    .where(and(eq(shifts.id, id), eq(shifts.companyId, companyId)))
    .returning({ id: shifts.id });
  if (!deleted) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  res.status(204).end();
});

export default router;
