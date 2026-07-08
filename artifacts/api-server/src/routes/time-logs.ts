import { Router } from "express";
import { db } from "@workspace/db";
import { timeLogs, shifts, users } from "@workspace/db";
import { eq, and, isNull, isNotNull, gte, lte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import { format } from "date-fns";

const router = Router();
router.use(requireAuth);

const clockInSchema = z.object({
  shiftId: z.number().int().positive().optional().nullable(),
  locationValid: z.boolean().optional(),
});

const employeeClockOutSchema = z.object({
  actualOut: z.string().optional().nullable(),
  locationValid: z.boolean().optional(),
});

const managerUpdateSchema = z.object({
  actualOut: z.string().optional().nullable(),
  locationValid: z.boolean().optional(),
  payrollIn: z.string().optional().nullable(),
  payrollOut: z.string().optional().nullable(),
  validatedHours: z.string().optional().nullable(),
  managerValidated: z.boolean().optional(),
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
    ? await db.select().from(timeLogs).where(eq(timeLogs.companyId, companyId))
    : await db.select().from(timeLogs).where(and(eq(timeLogs.companyId, companyId), eq(timeLogs.employeeId, userId)));
  res.json(result);
});

// GET /api/time-logs/export-csv — download payroll as CSV (manager/admin only)
router.get("/export-csv", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company" });
    return;
  }

  const period = (req.query["period"] as string) || "month";
  const now = new Date();
  let startDate: Date;
  let endDate = new Date(now);

  if (period === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff));
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const logs = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.companyId, companyId), gte(timeLogs.actualIn, startDate), lte(timeLogs.actualIn, endDate)));

  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, hourlyRate: users.hourlyRate }).from(users).where(eq(users.companyId, companyId));

  const userMap = new Map(allUsers.map(u => [u.id, u]));

  const csvRows = [
    ["Employee", "Email", "Date", "Clock In", "Clock Out", "Hours", "Validated Hours", "Validation", "Hourly Rate", "Estimated Pay", "Paid"].join(","),
  ];

  for (const log of logs) {
    const emp = userMap.get(log.employeeId);
    const empName = emp?.name || `User #${log.employeeId}`;
    const empEmail = emp?.email || "";
    const date = format(new Date(log.actualIn), "yyyy-MM-dd");
    const clockIn = format(new Date(log.actualIn), "HH:mm");
    const clockOut = log.actualOut ? format(new Date(log.actualOut), "HH:mm") : "";
    const hours = log.actualOut
      ? ((new Date(log.actualOut).getTime() - new Date(log.actualIn).getTime()) / 3600000).toFixed(2)
      : "";

    // Either location-based or manager-approved validation counts
    const isValidated = log.locationValid || log.managerValidated;
    const validationLabel = log.locationValid && log.managerValidated
      ? "Both"
      : log.locationValid
      ? "Location"
      : log.managerValidated
      ? "Manager"
      : "None";

    const validatedHours = log.validatedHours ?? hours;
    const hourlyRate = emp?.hourlyRate ?? "0";

    // Only compute estimated pay for validated logs
    const estimatedPay = isValidated && validatedHours && hourlyRate
      ? (parseFloat(validatedHours) * parseFloat(hourlyRate)).toFixed(2)
      : "";
    const paid = log.paid ? "Yes" : "No";

    csvRows.push([empName, empEmail, date, clockIn, clockOut, hours, validatedHours, validationLabel, hourlyRate, estimatedPay, paid].join(","));
  }

  const csv = csvRows.join("\n");
  const filename = `payroll-${period}-${format(startDate, "yyyy-MM-dd")}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
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
  if (parsed.data.shiftId != null) {
    const [shift] = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.id, parsed.data.shiftId), eq(shifts.companyId, companyId)))
      .limit(1);
    if (!shift) {
      res.status(400).json({ error: "Shift not found in this company" });
      return;
    }
  }
  const [open] = await db
    .select({ id: timeLogs.id })
    .from(timeLogs)
    .where(and(eq(timeLogs.employeeId, userId), eq(timeLogs.companyId, companyId), isNull(timeLogs.actualOut)))
    .limit(1);
  if (open) {
    res.status(409).json({ error: "Already clocked in", openLogId: open.id });
    return;
  }
  const [log] = await db
    .insert(timeLogs)
    .values({ employeeId: userId, companyId, actualIn: new Date(), shiftId: parsed.data.shiftId ?? null, locationValid: parsed.data.locationValid ?? false })
    .returning();
  res.status(201).json(log);
});

// POST /api/time-logs/settle-period — bulk mark all unpaid completed logs as paid (admin only)
router.post("/settle-period", requireRole("admin"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }

  const parsed = z.object({ period: z.enum(["week", "month"]) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "period must be 'week' or 'month'" });
    return;
  }

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (parsed.data.period === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const result = await db
    .update(timeLogs)
    .set({ paid: true })
    .where(
      and(
        eq(timeLogs.companyId, companyId),
        eq(timeLogs.paid, false),
        isNotNull(timeLogs.actualOut),
        gte(timeLogs.actualIn, startDate),
        lte(timeLogs.actualIn, endDate),
      ),
    )
    .returning({ id: timeLogs.id });

  res.json({ settled: result.length });
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
  const [log] = await db.select().from(timeLogs).where(and(eq(timeLogs.id, id), eq(timeLogs.companyId, companyId))).limit(1);
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
router.put("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [log] = await db.select().from(timeLogs).where(and(eq(timeLogs.id, id), eq(timeLogs.companyId, companyId))).limit(1);
  if (!log) {
    res.status(404).json({ error: "Time log not found" });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  const toDate = (v: string | null | undefined): Date | null | undefined => {
    if (v === null) return null;
    if (v === undefined) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  };

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
    if (parsed.data.locationValid !== undefined) updates.locationValid = parsed.data.locationValid;
    const actualOut = toDate(parsed.data.actualOut);
    if (actualOut !== undefined) updates.actualOut = actualOut;
    if (Object.keys(updates).length === 0 && !log.actualOut) updates.actualOut = new Date();
    const [updated] = await db.update(timeLogs).set(updates).where(eq(timeLogs.id, id)).returning();
    res.json(updated);
    return;
  }

  const parsed = managerUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.locationValid !== undefined) updates.locationValid = parsed.data.locationValid;
  if (parsed.data.validatedHours !== undefined) updates.validatedHours = parsed.data.validatedHours;
  if (parsed.data.managerValidated !== undefined) {
    updates.managerValidated = parsed.data.managerValidated;
    updates.managerValidatedAt = parsed.data.managerValidated ? new Date() : null;
  }
  if (parsed.data.paid !== undefined) updates.paid = parsed.data.paid;
  const actualOut = toDate(parsed.data.actualOut);
  if (actualOut !== undefined) updates.actualOut = actualOut;
  if (Object.keys(updates).length === 0 && !log.actualOut) updates.actualOut = new Date();
  const payrollIn = toDate(parsed.data.payrollIn);
  const payrollOut = toDate(parsed.data.payrollOut);
  if (payrollIn !== undefined) updates.payrollIn = payrollIn;
  if (payrollOut !== undefined) updates.payrollOut = payrollOut;
  const [updated] = await db.update(timeLogs).set(updates).where(eq(timeLogs.id, id)).returning();
  res.json(updated);
});

export default router;
