import { Router } from "express";
import { db } from "@workspace/db";
import { timeLogs, shifts, users, workplaces } from "@workspace/db";
import { eq, and, isNull, isNotNull, gte, lte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import { format } from "date-fns";

/** Haversine distance in meters between two lat/lng points */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const router = Router();
router.use(requireAuth);

const clockInSchema = z.object({
  shiftId: z.number().int().positive().optional().nullable(),
  // locationValid is intentionally NOT accepted from the client — derived server-side only
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  /** GPS accuracy radius in metres from the browser Geolocation API */
  accuracy: z.number().optional().nullable(),
  /** Unix-ms timestamp from the browser position object — used for freshness check */
  positionTimestamp: z.number().optional().nullable(),
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

  const now = new Date();
  let locationValid = false;
  let payrollIn: Date | null = null;
  let resolvedShiftId: number | null = parsed.data.shiftId ?? null;
  const spoofFlags: string[] = [];

  const { latitude, longitude, accuracy, positionTimestamp } = parsed.data;
  const hasCoords = latitude != null && longitude != null;

  // ── Anti-spoofing checks (run whenever coordinates are provided) ───────────

  if (hasCoords) {
    // 1. Accuracy check
    //    Real GPS hardware never reports exactly 0 m accuracy — that value is
    //    the fingerprint of most mock-location providers.
    //    Suspiciously perfect accuracy (< 2 m) is also characteristic of fakes.
    //    Accuracy > 1000 m means the device has no real fix and cannot reliably
    //    verify a geofence.
    if (accuracy != null) {
      if (accuracy === 0) {
        spoofFlags.push("zero_accuracy");          // certain mock provider signature
      } else if (accuracy < 2) {
        spoofFlags.push("suspicious_accuracy");    // implausibly perfect
      } else if (accuracy > 1000) {
        spoofFlags.push("poor_accuracy");          // no real GPS fix
      }
    }

    // 2. Position freshness check
    //    The browser Geolocation API returns a `timestamp` (Unix ms) on the
    //    position object. Require it to be ≤ 90 seconds old so employees
    //    cannot replay a cached coordinate obtained at a real location earlier.
    if (positionTimestamp != null) {
      const ageSeconds = (now.getTime() - positionTimestamp) / 1000;
      if (ageSeconds > 90) {
        spoofFlags.push("stale_position");
      }
    }

    // 3. Velocity plausibility check
    //    Fetch the most recent *completed* log for this employee that has stored
    //    coordinates. Compute the implied travel speed since that log's clock-out.
    //    > 500 km/h is physically impossible for ground transport.
    const [prevLog] = await db
      .select({
        actualOut: timeLogs.actualOut,
        clockInLat: timeLogs.clockInLat,
        clockInLng: timeLogs.clockInLng,
      })
      .from(timeLogs)
      .where(
        and(
          eq(timeLogs.employeeId, userId),
          isNotNull(timeLogs.actualOut),
          isNotNull(timeLogs.clockInLat),
          isNotNull(timeLogs.clockInLng),
        ),
      )
      .orderBy(timeLogs.actualOut)
      .limit(1);

    if (prevLog?.actualOut && prevLog.clockInLat && prevLog.clockInLng) {
      const elapsedSeconds = (now.getTime() - new Date(prevLog.actualOut).getTime()) / 1000;
      if (elapsedSeconds > 0) {
        const distMeters = haversineDistance(
          parseFloat(prevLog.clockInLat),
          parseFloat(prevLog.clockInLng),
          latitude!,
          longitude!,
        );
        const speedKmh = (distMeters / 1000) / (elapsedSeconds / 3600);
        if (speedKmh > 500) {
          spoofFlags.push("impossible_speed");
        }
      }
    }
  }

  // ── Validate shift: must belong to company AND be assigned to this employee ─
  if (resolvedShiftId != null) {
    const [shift] = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.id, resolvedShiftId),
          eq(shifts.companyId, companyId),
          eq(shifts.employeeId, userId),
        ),
      )
      .limit(1);
    if (!shift) {
      res.status(400).json({ error: "Shift not found or not assigned to you" });
      return;
    }

    // ── Geofence check (only when no spoofing flags are raised) ──────────────
    // If any spoofing signal fired we already know locationValid stays false,
    // so skip the geofence check to avoid a misleading "in-range" result.
    if (hasCoords && spoofFlags.length === 0 && shift.workplaceId != null) {
      const [wp] = await db
        .select()
        .from(workplaces)
        .where(eq(workplaces.id, shift.workplaceId))
        .limit(1);

      if (wp && wp.latitude != null && wp.longitude != null) {
        const dist = haversineDistance(
          latitude!,
          longitude!,
          parseFloat(wp.latitude),
          parseFloat(wp.longitude),
        );
        locationValid = dist <= wp.radiusMeters;
      }
    }

    // ── Auto payroll start time ────────────────────────────────────────────
    const shiftStart = new Date(shift.startTime);
    const diffMins = (now.getTime() - shiftStart.getTime()) / 60000;
    if (diffMins >= -10 && diffMins <= 10) {
      payrollIn = shiftStart;
    }
  }

  // ── Geofence check for free clock-ins (no shift selected) ─────────────────
  // When no shift is linked we don't know the intended workplace, so we check
  // whether the employee is inside ANY of the company's configured workplaces.
  if (!locationValid && hasCoords && spoofFlags.length === 0 && resolvedShiftId === null) {
    const companyWorkplaces = await db
      .select()
      .from(workplaces)
      .where(
        and(
          eq(workplaces.companyId, companyId),
          isNotNull(workplaces.latitude),
          isNotNull(workplaces.longitude),
        ),
      );

    for (const wp of companyWorkplaces) {
      if (wp.latitude == null || wp.longitude == null) continue;
      const dist = haversineDistance(
        latitude!,
        longitude!,
        parseFloat(wp.latitude),
        parseFloat(wp.longitude),
      );
      if (dist <= wp.radiusMeters) {
        locationValid = true;
        break;
      }
    }
  }

  // ── Duplicate open-log guard ───────────────────────────────────────────────
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
    .values({
      employeeId: userId,
      companyId,
      actualIn: now,
      shiftId: resolvedShiftId,
      locationValid,
      clockInLat: latitude != null ? String(latitude) : null,
      clockInLng: longitude != null ? String(longitude) : null,
      locationFlags: spoofFlags.length > 0 ? spoofFlags.join(",") : null,
      payrollIn,
    })
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
