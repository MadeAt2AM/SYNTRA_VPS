import { Router } from "express";
import { db } from "@workspace/db";
import { availability, users } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const availabilitySchema = z.object({
  weekStart: z.string().min(1),
  slots: z.unknown(), // flexible JSON — e.g. { monday: ["09:00-17:00"] }
  notes: z.string().optional().nullable(),
  employeeId: z.number().int().positive().optional(),
});

// GET /api/availability
router.get("/", async (req, res) => {
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  const result = isManager
    ? await db
        .select()
        .from(availability)
        .where(eq(availability.companyId, companyId))
    : await db
        .select()
        .from(availability)
        .where(
          and(
            eq(availability.companyId, companyId),
            eq(availability.employeeId, userId),
          ),
        );
  res.json(result);
});

// POST /api/availability
router.post("/", async (req, res) => {
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  let empId = userId;

  if (isManager && parsed.data.employeeId != null) {
    // Validate the employee belongs to this company
    const [emp] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, parsed.data.employeeId),
          eq(users.companyId, companyId),
        ),
      )
      .limit(1);
    if (!emp) {
      res.status(400).json({ error: "Employee not found in this company" });
      return;
    }
    empId = emp.id;
  }

  const [avail] = await db
    .insert(availability)
    .values({
      employeeId: empId,
      companyId,
      weekStart: parsed.data.weekStart,
      slots: parsed.data.slots,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json(avail);
});

// GET /api/availability/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [avail] = await db
    .select()
    .from(availability)
    .where(and(eq(availability.id, id), eq(availability.companyId, companyId)))
    .limit(1);
  if (!avail) {
    res.status(404).json({ error: "Availability not found" });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  if (!isManager && avail.employeeId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(avail);
});

// PUT /api/availability/:id
router.put("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [existing] = await db
    .select()
    .from(availability)
    .where(and(eq(availability.id, id), eq(availability.companyId, companyId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Availability not found" });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  if (!isManager && existing.employeeId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = availabilitySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { employeeId: _emp, ...updates } = parsed.data;
  const [updated] = await db
    .update(availability)
    .set(updates)
    .where(eq(availability.id, id))
    .returning();
  res.json(updated);
});

export default router;
