import { Router } from "express";
import { db } from "@workspace/db";
import { timeLogs, shifts } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const clockInSchema = z.object({
  shiftId: z.number().int().positive().optional().nullable(),
  locationValid: z.boolean().optional(),
});

/** Fields an employee can write when clocking out — nothing payroll-related. */
const employeeClockOutSchema = z.object({
  actualOut: z.string().optional().nullable(),
  locationValid: z.boolean().optional(),
});

/** Full correction schema for admin / manager — includes all payroll fields. */
const managerUpdateSchema = z.object({
  actualOut: z.string().optional().nullable(),
  locationValid: z.boolean().optional(),
  payrollIn: z.string().optional().nullable(),
  payrollOut: z.string().optional().nullable(),
  validatedHours: z.string().optional().nullable(),
  paid: z.boolean().optional(),
});

// GET /api/time-logs
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
        .from(timeLogs)
        .where(eq(timeLogs.companyId, companyId))
    : await db
        .select()
        .from(timeLogs)
        .where(
          and(
            eq(timeLogs.companyId, companyId),
            eq(timeLogs.employeeId, userId),
          ),
        );
  res.json(result);
});

// POST /api/time-logs — clock in
router.post("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }

  const parsed = clockInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Validate shiftId belongs to this company
  if (parsed.data.shiftId != null) {
    const [shift] = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          eq(shifts.id, parsed.data.shiftId),
          eq(shifts.companyId, companyId),
        ),
      )
      .limit(1);
    if (!shift) {
      res.status(400).json({ error: "Shift not found in this company" });
      return;
    }
  }

  // Prevent double clock-in
  const [open] = await db
    .select({ id: timeLogs.id })
    .from(timeLogs)
    .where(
      and(
        eq(timeLogs.employeeId, userId),
        eq(timeLogs.companyId, companyId),
        isNull(timeLogs.actualOut),
      ),
    )
    .limit(1);
  if (open) {
    res.status(409).json({ error: "Already clocked in", openLogId: open.id });
    return;
  }

  const [log] = await db
    .insert(timeLogs)
    .values({
      employeeId: userId,
      companyId,
      actualIn: new Date(),
      shiftId: parsed.data.shiftId ?? null,
      locationValid: parsed.data.locationValid ?? false,
    })
    .returning();
  res.status(201).json(log);
});

// GET /api/time-logs/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [log] = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.id, id), eq(timeLogs.companyId, companyId)))
    .limit(1);
  if (!log) {
    res.status(404).json({ error: "Time log not found" });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  if (!isManager && log.employeeId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(log);
});

// PUT /api/time-logs/:id
// Employees: clock out only (actualOut + locationValid).
// Admin / manager: full correction including payroll fields.
router.put("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [log] = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.id, id), eq(timeLogs.companyId, companyId)))
    .limit(1);
  if (!log) {
    res.status(404).json({ error: "Time log not found" });
    return;
  }

  const isManager = ["admin", "manager"].includes(role);

  // Employees can only update their own log and only clock-out fields
  if (!isManager) {
    if (log.employeeId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = employeeClockOutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.locationValid !== undefined)
      updates.locationValid = parsed.data.locationValid;

    const toDate = (v: string | null | undefined): Date | null | undefined => {
      if (v === null) return null;
      if (v === undefined) return undefined;
      const d = new Date(v);
      return isNaN(d.getTime()) ? undefined : d;
    };

    const actualOut = toDate(parsed.data.actualOut);
    if (actualOut !== undefined) updates.actualOut = actualOut;
    // Empty body → clock out now
    if (Object.keys(updates).length === 0 && !log.actualOut) {
      updates.actualOut = new Date();
    }

    const [updated] = await db
      .update(timeLogs)
      .set(updates)
      .where(eq(timeLogs.id, id))
      .returning();
    res.json(updated);
    return;
  }

  // Admin / manager: full correction
  const parsed = managerUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const toDate = (v: string | null | undefined): Date | null | undefined => {
    if (v === null) return null;
    if (v === undefined) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  };

  const updates: Record<string, unknown> = {};
  if (parsed.data.locationValid !== undefined)
    updates.locationValid = parsed.data.locationValid;
  if (parsed.data.validatedHours !== undefined)
    updates.validatedHours = parsed.data.validatedHours;
  if (parsed.data.paid !== undefined) updates.paid = parsed.data.paid;

  const actualOut = toDate(parsed.data.actualOut);
  if (actualOut !== undefined) updates.actualOut = actualOut;
  if (Object.keys(updates).length === 0 && !log.actualOut) {
    updates.actualOut = new Date();
  }
  const payrollIn = toDate(parsed.data.payrollIn);
  const payrollOut = toDate(parsed.data.payrollOut);
  if (payrollIn !== undefined) updates.payrollIn = payrollIn;
  if (payrollOut !== undefined) updates.payrollOut = payrollOut;

  const [updated] = await db
    .update(timeLogs)
    .set(updates)
    .where(eq(timeLogs.id, id))
    .returning();
  res.json(updated);
});

export default router;
