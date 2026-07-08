import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, users, workplaces, leaveRequests } from "@workspace/db";
import { eq, and, gte, lte, or } from "drizzle-orm";
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
      .where(and(eq(workplaces.id, workplaceId), eq(workplaces.companyId, companyId)))
      .limit(1);
    if (!wp) return `Workplace ${workplaceId} not found in this company`;
  }
  return null;
}

/** Check approved leave conflicts for an employee on given date range */
async function checkLeaveConflict(
  companyId: number,
  employeeId: number,
  startTime: Date,
  endTime: Date,
): Promise<{ hasConflict: boolean; hasPending: boolean; leaveType?: string }> {
  const shiftDate = startTime.toISOString().split("T")[0];
  const allLeave = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.companyId, companyId),
        eq(leaveRequests.employeeId, employeeId),
      ),
    );

  for (const leave of allLeave) {
    const leaveStart = leave.startDate;
    const leaveEnd = leave.endDate;
    if (shiftDate >= leaveStart && shiftDate <= leaveEnd) {
      if (leave.status === "approved") {
        return { hasConflict: true, hasPending: false, leaveType: leave.type };
      }
      if (leave.status === "pending") {
        return { hasConflict: false, hasPending: true, leaveType: leave.type };
      }
    }
  }
  return { hasConflict: false, hasPending: false };
}

// GET /api/shifts
router.get("/", async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const result = await db.select().from(shifts).where(eq(shifts.companyId, companyId));
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
  const crossRefError = await validateCrossRefs(companyId, parsed.data.employeeId, parsed.data.workplaceId);
  if (crossRefError) {
    res.status(400).json({ error: crossRefError });
    return;
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = new Date(parsed.data.endTime);

  // Check approved leave conflict — block if approved, warn if pending
  if (parsed.data.employeeId) {
    const conflict = await checkLeaveConflict(companyId, parsed.data.employeeId, startTime, endTime);
    if (conflict.hasConflict) {
      res.status(409).json({
        error: `Employee has approved ${conflict.leaveType} leave on this date`,
        leaveConflict: true,
        leaveType: conflict.leaveType,
      });
      return;
    }
    if (conflict.hasPending) {
      // Allow creation but include warning in response header
      res.setHeader("X-Leave-Warning", `pending:${conflict.leaveType}`);
    }
  }

  const { startTime: _s, endTime: _e, ...rest } = parsed.data;
  const [shift] = await db
    .insert(shifts)
    .values({ ...rest, companyId, createdBy: userId, startTime, endTime })
    .returning();
  res.status(201).json(shift);
});

// GET /api/shifts/leave-check — check leave conflicts for a given employee + date
router.get("/leave-check", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company" });
    return;
  }
  const employeeId = parseInt(req.query["employeeId"] as string);
  const date = req.query["date"] as string;
  if (!employeeId || !date) {
    res.status(400).json({ error: "employeeId and date required" });
    return;
  }
  const startTime = new Date(`${date}T00:00:00`);
  const endTime = new Date(`${date}T23:59:59`);
  const conflict = await checkLeaveConflict(companyId, employeeId, startTime, endTime);
  res.json(conflict);
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
  const crossRefError = await validateCrossRefs(companyId, parsed.data.employeeId, parsed.data.workplaceId);
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
