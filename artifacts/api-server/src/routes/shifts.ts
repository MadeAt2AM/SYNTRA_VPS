import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, users, workplaces, leaveRequests, availability, notifications } from "@workspace/db";
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
  isSuggested: z.boolean().optional(),
  suggestedData: z.unknown().optional().nullable(),
});

async function validateCrossRefs(
  companyId: number,
  employeeId: number | null | undefined,
  workplaceId: number | null | undefined,
): Promise<string | null> {
  if (employeeId != null) {
    const [emp] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.id, employeeId), eq(users.companyId, companyId)))
      .limit(1);
    if (!emp) return `Employee ${employeeId} not found in this company`;
    // Admins are company owners, not scheduled staff — shifts cannot be assigned to them.
    if (emp.role === "admin") return `Cannot assign shifts to an admin — admins are owners, not staff`;
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

// GET /api/shifts/leave-check
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

// POST /api/shifts/suggest — generate suggested shifts for next week
router.post("/suggest", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }

  const parsed = z.object({
    weekStart: z.string().min(1), // "YYYY-MM-DD" monday of target week
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "weekStart required" });
    return;
  }

  const targetWeekStart = new Date(parsed.data.weekStart);
  // Last week
  const lastWeekStart = new Date(targetWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(targetWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  // Get last week's published shifts
  const lastWeekShifts = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.companyId, companyId),
        eq(shifts.status, "published"),
        gte(shifts.startTime, lastWeekStart),
        lte(shifts.startTime, lastWeekEnd),
      ),
    );

  // Get all active employees
  const employees = await db
    .select()
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.status, "active")));
  // Admins are company owners, not scheduled staff — never auto-suggest shifts for them.
  const activeEmployees = employees.filter(e => e.role !== "platform_admin" && e.role !== "admin");

  // Get availability for the target week
  const targetWeekStartStr = parsed.data.weekStart;
  const allAvailability = await db
    .select()
    .from(availability)
    .where(and(eq(availability.companyId, companyId), eq(availability.weekStart, targetWeekStartStr)));

  // Build availability map: employeeId -> { dateStr -> slotValue }
  const availMap = new Map<number, Record<string, any>>();
  for (const av of allAvailability) {
    availMap.set(av.employeeId, (av.slots as Record<string, any>) ?? {});
  }

  // Get already-existing shifts for the target week (skip those days)
  const targetWeekEnd = new Date(targetWeekStart);
  targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
  const existingShifts = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.companyId, companyId),
        gte(shifts.startTime, targetWeekStart),
        lte(shifts.startTime, targetWeekEnd),
      ),
    );
  const existingKeys = new Set(existingShifts.map(s => `${s.employeeId}:${s.startTime.toISOString().split("T")[0]}`));

  // Build suggestions based on last week's pattern
  // Greedy: for each last-week shift, try to assign the same employee this week.
  // Count shifts per employee so we fill least-covered first.
  const shiftCountPerEmp = new Map<number, number>();
  for (const emp of activeEmployees) shiftCountPerEmp.set(emp.id, 0);

  const suggestions: Array<{
    employeeId: number;
    workplaceId: number | null;
    startTime: Date;
    endTime: Date;
    role: string | null;
    notes: string | null;
    isSuggested: boolean;
    suggestedData: object;
  }> = [];

  // Sort last week shifts by day so we process them in order
  const sortedLastWeek = [...lastWeekShifts].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (const lastShift of sortedLastWeek) {
    if (!lastShift.employeeId) continue;

    // Map to same day-of-week in target week
    const lastDay = lastShift.startTime.getDay(); // 0=Sun ... 6=Sat
    const targetDate = new Date(targetWeekStart);
    // targetWeekStart is Monday (day 1). lastDay from Monday=1..Sunday=0
    const daysFromMonday = lastDay === 0 ? 6 : lastDay - 1;
    targetDate.setDate(targetWeekStart.getDate() + daysFromMonday);
    const targetDateStr = targetDate.toISOString().split("T")[0];

    // Skip if shift already exists for this employee on this day
    if (existingKeys.has(`${lastShift.employeeId}:${targetDateStr}`)) continue;

    // Check availability: employee must be available (not unavailable)
    const empSlots = availMap.get(lastShift.employeeId) ?? {};
    const slotVal = empSlots[targetDateStr];
    const isUnavailable =
      slotVal === false ||
      (typeof slotVal === "object" && slotVal !== null && slotVal.unavailable === true);
    if (isUnavailable) {
      // Try to find a replacement: pick available employee with fewest shifts
      const sortedByCount = activeEmployees
        .filter(e => {
          if (e.id === lastShift.employeeId) return false;
          const key = `${e.id}:${targetDateStr}`;
          if (existingKeys.has(key)) return false;
          const eSlots = availMap.get(e.id) ?? {};
          const eSlot = eSlots[targetDateStr];
          if (eSlot === false || (typeof eSlot === "object" && eSlot !== null && eSlot.unavailable === true)) return false;
          return true;
        })
        .sort((a, b) => (shiftCountPerEmp.get(a.id) ?? 0) - (shiftCountPerEmp.get(b.id) ?? 0));

      if (sortedByCount.length === 0) continue;
      const replacement = sortedByCount[0]!;

      const lastStart = lastShift.startTime;
      const lastEnd = lastShift.endTime;
      const targetStart = new Date(targetDate);
      targetStart.setHours(lastStart.getHours(), lastStart.getMinutes(), 0, 0);
      const targetEnd = new Date(targetDate);
      targetEnd.setHours(lastEnd.getHours(), lastEnd.getMinutes(), 0, 0);

      suggestions.push({
        employeeId: replacement.id,
        workplaceId: lastShift.workplaceId ?? null,
        startTime: targetStart,
        endTime: targetEnd,
        role: lastShift.role ?? null,
        notes: lastShift.notes ?? null,
        isSuggested: true,
        suggestedData: { basedOnShiftId: lastShift.id, originalEmployee: lastShift.employeeId, replacedUnavailable: true },
      });
      existingKeys.add(`${replacement.id}:${targetDateStr}`);
      shiftCountPerEmp.set(replacement.id, (shiftCountPerEmp.get(replacement.id) ?? 0) + 1);
      continue;
    }

    const lastStart = lastShift.startTime;
    const lastEnd = lastShift.endTime;
    const targetStart = new Date(targetDate);
    targetStart.setHours(lastStart.getHours(), lastStart.getMinutes(), 0, 0);
    const targetEnd = new Date(targetDate);
    targetEnd.setHours(lastEnd.getHours(), lastEnd.getMinutes(), 0, 0);

    suggestions.push({
      employeeId: lastShift.employeeId,
      workplaceId: lastShift.workplaceId ?? null,
      startTime: targetStart,
      endTime: targetEnd,
      role: lastShift.role ?? null,
      notes: lastShift.notes ?? null,
      isSuggested: true,
      suggestedData: { basedOnShiftId: lastShift.id },
    });
    existingKeys.add(`${lastShift.employeeId}:${targetDateStr}`);
    shiftCountPerEmp.set(lastShift.employeeId, (shiftCountPerEmp.get(lastShift.employeeId) ?? 0) + 1);
  }

  if (suggestions.length === 0) {
    res.json({ inserted: 0, suggestions: [] });
    return;
  }

  // Insert all suggestions as draft shifts
  const { userId } = req.auth!;
  const inserted = await db
    .insert(shifts)
    .values(suggestions.map(s => ({ ...s, companyId, createdBy: userId, status: "draft" as const })))
    .returning();

  res.status(201).json({ inserted: inserted.length, suggestions: inserted });
});

// POST /api/shifts/approve-suggestions — approve all suggested drafts for a week.
// By default publishes them; pass { publish: false } to just move them into
// the regular draft pool (clears the "suggested" flag but keeps status: draft).
router.post("/approve-suggestions", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company" });
    return;
  }
  const parsed = z.object({ weekStart: z.string().min(1), publish: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "weekStart required" });
    return;
  }

  const publish = parsed.data.publish !== false;
  const targetWeekStart = new Date(parsed.data.weekStart);
  const targetWeekEnd = new Date(targetWeekStart);
  targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);

  const updated = await db
    .update(shifts)
    .set(publish ? { isSuggested: false, status: "published" } : { isSuggested: false })
    .where(
      and(
        eq(shifts.companyId, companyId),
        eq(shifts.isSuggested, true),
        eq(shifts.status, "draft"),
        gte(shifts.startTime, targetWeekStart),
        lte(shifts.startTime, targetWeekEnd),
      ),
    )
    .returning({ id: shifts.id });

  res.json({ approved: updated.length, published: publish });
});

// POST /api/shifts/:id/claim — an employee claims an unassigned open shift directly.
router.post("/:id/claim", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, id), eq(shifts.companyId, companyId)))
    .limit(1);
  if (!shift) { res.status(404).json({ error: "Shift not found" }); return; }
  if (shift.employeeId) { res.status(400).json({ error: "This shift is already assigned" }); return; }
  if (shift.status !== "published") { res.status(400).json({ error: "This shift is not open" }); return; }

  const [updated] = await db
    .update(shifts)
    .set({ employeeId: userId })
    .where(and(eq(shifts.id, id), eq(shifts.companyId, companyId)))
    .returning();

  const [claimer] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const shiftStart = new Date(shift.startTime).toLocaleString();

  const managers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.status, "active")));
  const mgNotifs = managers
    .filter(m => (m.role === "admin" || m.role === "manager") && m.id !== userId)
    .map(m => ({
      companyId: companyId!,
      userId: m.id,
      type: "shift_taken",
      title: "Open Shift Claimed",
      message: `${claimer?.name ?? "An employee"} claimed the open shift on ${shiftStart}.`,
      data: { shiftId: id, claimedBy: userId },
    }));
  if (mgNotifs.length > 0) await db.insert(notifications).values(mgNotifs);

  res.json(updated);
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
