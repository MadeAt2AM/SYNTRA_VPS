import { Router } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { shifts, users, workplaces, companies } from "@workspace/db";
import { and, eq, or, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generateIcal } from "../lib/ical";

const router = Router();

/**
 * RFC 4122 v4 UUID — opaque, URL-safe, no PII. 256 bits of entropy is way
 * overkill for an iCal subscription token, but `crypto.randomUUID()` is
 * available on every supported Node version and the URL stays short.
 */
function mintWebcalToken(): string {
  return crypto.randomUUID();
}

/**
 * POST /api/calendar/token — mint or refresh the caller's webcal token.
 * Requires Bearer auth. Idempotent: returns the existing token if already
 * minted; mints on first call.
 *
 * The token authenticates GET /api/calendar/shifts.ics?token=... (the URL
 * calendar apps re-fetch on every sync). Treat it as a credential — never
 * log it, never echo it in places it doesn't need to be.
 */
router.post("/token", requireAuth, async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.auth.userId;

  try {
    const [existing] = await db
      .select({ webcalToken: users.webcalToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existing?.webcalToken) {
      res.json({ token: existing.webcalToken });
      return;
    }

    const token = mintWebcalToken();
    await db
      .update(users)
      .set({ webcalToken: token, webcalTokenCreatedAt: new Date() })
      .where(eq(users.id, userId));

    req.log?.info({ userId }, "Minted webcal token");
    res.json({ token });
  } catch (err) {
    req.log?.error({ err }, "Failed to mint webcal token");
    res.status(500).json({ error: "Failed to mint token" });
  }
});

/**
 * DELETE /api/calendar/token — revoke the caller's webcal token. After this,
 * the subscription URL returns 401 until a new token is minted. Use case:
 * user loses their phone / leaves the company.
 */
router.delete("/token", requireAuth, async (req, res) => {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db
    .update(users)
    .set({ webcalToken: null, webcalTokenCreatedAt: null })
    .where(eq(users.id, req.auth.userId));
  res.json({ success: true });
});

/**
 * GET /api/calendar/shifts.ics?token=<webcalToken>[&scope=mine|company]
 *
 * Public-by-token endpoint. Calendar apps re-fetch this URL on every sync;
 * they can't carry a Bearer header. Token-in-URL is the standard pattern
 * (Google Calendar private ical URLs do exactly this).
 *
 * Response:
 *   - Content-Type: text/calendar; charset=utf-8
 *   - Content-Disposition: inline; filename="..."  ← inline, NOT attachment,
 *     so well-behaved browsers render the iCal and route it to a calendar
 *     handler instead of forcing a download.
 *   - Cache-Control: no-store (always-fresh: shifts change frequently)
 *   - CORS: open — any origin can subscribe; the token IS the auth.
 *
 * scope:
 *   - mine (default): own published shifts, plus any unassigned published
 *     shifts in the same company (so staff can see open shifts too).
 *   - company: every published shift in the user's company. Managers+admins
 *     only — employees get 403 if they ask for company scope.
 */
router.get("/shifts.ics", async (req, res) => {
  const token = typeof req.query["token"] === "string" ? req.query["token"] : "";
  const scope = req.query["scope"] === "company" ? "company" : "mine";

  if (!token) {
    res.status(401).type("text/plain").send("Missing token");
    return;
  }

  // Look up the user by webcal token. Single indexed query — fine at our
  // scale. If this becomes hot, add a UNIQUE index on users.webcal_token.
  const [owner] = await db
    .select({
      id: users.id,
      role: users.role,
      companyId: users.companyId,
      status: users.status,
    })
    .from(users)
    .where(eq(users.webcalToken, token))
    .limit(1);

  if (!owner) {
    res.status(401).type("text/plain").send("Invalid or revoked token");
    return;
  }
  if (owner.status !== "active" || !owner.companyId) {
    res.status(403).type("text/plain").send("Account inactive");
    return;
  }
  if (scope === "company" && owner.role !== "admin" && owner.role !== "manager") {
    res.status(403).type("text/plain").send("Forbidden");
    return;
  }

  // Fetch shifts + joined workplace + company name.
  // The published-status filter is critical — we never leak draft shifts
  // (which may contain unannounced scheduling, employee info, etc.) into a
  // calendar the user might be sharing with family.
  const whereClauses = [
    eq(shifts.companyId, owner.companyId),
    eq(shifts.status, "published"),
    scope === "mine"
      ? or(eq(shifts.employeeId, owner.id), isNull(shifts.employeeId))
      : eq(shifts.companyId, owner.companyId),
  ];

  const rows = await db
    .select({
      id: shifts.id,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      role: shifts.role,
      notes: shifts.notes,
      workplaceName: workplaces.name,
      workplaceAddress: workplaces.address,
      companyName: companies.name,
    })
    .from(shifts)
    .leftJoin(workplaces, eq(shifts.workplaceId, workplaces.id))
    .leftJoin(companies, eq(shifts.companyId, companies.id))
    .where(and(...whereClauses));

  // drizzle's `timestamp` column hydrates to JS Date; normalize to ISO
  // strings here so the ICalShift contract is satisfied and the iCal
  // generator's UTC conversion handles the rest. `leftJoin` columns can
  // be null even when the source column is NOT NULL — coerce defensively.
  const icalRows = rows.map((r) => ({
    id: r.id,
    startTime: (r.startTime instanceof Date ? r.startTime : new Date(r.startTime)).toISOString(),
    endTime: (r.endTime instanceof Date ? r.endTime : new Date(r.endTime)).toISOString(),
    role: r.role ?? undefined,
    notes: r.notes ?? undefined,
    workplaceName: r.workplaceName ?? undefined,
    workplaceAddress: r.workplaceAddress ?? undefined,
    companyName: r.companyName ?? undefined,
  }));

  const ical = generateIcal(icalRows, `${owner.companyId} — Syntra Shifts`);

  res
    .status(200)
    .set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="syntra-shifts-${owner.id}.ics"`,
      // CORS open — calendar apps on iOS/Android/macOS hit this from native
      // code, not browsers, so preflight never fires. We expose only the
      // minimum headers a calendar client needs.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      // Don't cache — shift assignments change and we want the next sync
      // to reflect the latest published state immediately.
      "Cache-Control": "no-store",
    })
    .send(ical);
});

export default router;