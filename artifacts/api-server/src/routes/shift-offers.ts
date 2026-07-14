import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, shiftOffers, users, companies, notifications } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import { sendEmail, type SmtpConfig } from "../lib/email";
import { renderBrandedEmail } from "../lib/email-templates";

const router = Router();
router.use(requireAuth);

// GET /api/shift-offers — list open offers for the company
router.get("/", async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }
  const result = await db
    .select()
    .from(shiftOffers)
    .where(eq(shiftOffers.companyId, companyId));
  res.json(result);
});

// POST /api/shift-offers — employee offers up their shift
router.post("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const parsed = z.object({ shiftId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { shiftId } = parsed.data;

  // Validate shift belongs to requester and is published
  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.companyId, companyId), eq(shifts.employeeId!, userId)))
    .limit(1);
  if (!shift) { res.status(404).json({ error: "Shift not found or not yours" }); return; }
  if (shift.status !== "published") { res.status(400).json({ error: "Can only offer published shifts" }); return; }

  // No duplicate open offers
  const [existing] = await db
    .select()
    .from(shiftOffers)
    .where(and(eq(shiftOffers.shiftId, shiftId), eq(shiftOffers.status, "open")))
    .limit(1);
  if (existing) { res.status(409).json({ error: "This shift is already offered" }); return; }

  const [offer] = await db
    .insert(shiftOffers)
    .values({ companyId, shiftId, offeredBy: userId })
    .returning();

  // Get offerer info
  const [offerer] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const shiftStart = new Date(shift.startTime).toLocaleString();

  // Notify ALL active employees in the company (except the offerer)
  const allEmployees = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.status, "active")));

  const employeeNotifs = allEmployees
    .filter(e => e.id !== userId)
    .map(e => ({
      companyId: companyId!,
      userId: e.id,
      type: "shift_offered",
      title: "Open Shift Available",
      message: `${offerer?.name ?? "A colleague"} has offered their shift (${shiftStart}). First to claim gets it!`,
      data: { offerId: offer.id, shiftId, shiftStart },
    }));
  if (employeeNotifs.length > 0) await db.insert(notifications).values(employeeNotifs);

  // Email every active staff member (excluding the offerer) so they see it even if they don't open the app
  try {
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (company?.smtpConfig) {
      const smtp = company.smtpConfig as SmtpConfig;
      const targets = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.companyId, companyId), eq(users.status, "active")));
      const appUrl = process.env["APP_URL"] || `${req.protocol}://${req.get("host")}`;
      const recipients = targets.filter(t => t.id !== userId).map(t => t.email).filter((e): e is string => !!e);
      const html = renderBrandedEmail(
        { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
        `
  <h3 style="color:#111;font-size:18px;font-weight:600;margin:0 0 16px">Open Shift Available</h3>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">
    <strong>${offerer?.name ?? "A colleague"}</strong> has offered their shift on <strong>${shiftStart}</strong>. First to claim it gets it.
  </p>
  <div style="text-align:center;margin:0 0 8px">
    <a href="${appUrl}/schedule" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px">View &amp; Take Shift</a>
  </div>
  <p style="color:#aaa;font-size:12px;margin-top:24px">You can accept or dismiss this from the Schedule page.</p>`,
      );
      await Promise.allSettled(recipients.map(email => sendEmail(smtp, email, "Open Shift Available", html)));
    }
  } catch (err) {
    req.log?.warn({ err }, "Failed to send shift-offer emails");
  }

  // Warn managers/admins of potential shortage
  const managers = allEmployees.filter(e => e.role === "admin" || e.role === "manager");
  const managerNotifs = managers
    .filter(m => m.id !== userId)
    .map(m => ({
      companyId: companyId!,
      userId: m.id,
      type: "shortage_warning",
      title: "⚠️ Potential Staff Shortage",
      message: `${offerer?.name ?? "An employee"} has offered their shift (${shiftStart}) — it is currently uncovered.`,
      data: { offerId: offer.id, shiftId, shiftStart },
    }));
  if (managerNotifs.length > 0) await db.insert(notifications).values(managerNotifs);

  // Update shift offerStatus
  await db.update(shifts).set({ offerStatus: "offered" }).where(eq(shifts.id, shiftId));

  res.status(201).json(offer);
});

// POST /api/shift-offers/:id/take — employee claims the shift (first-come first-served)
router.post("/:id/take", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }
  // Admins are company owners, not scheduled staff — they cannot take shifts.
  if (role === "admin") { res.status(403).json({ error: "Admins cannot take shifts" }); return; }

  const [offer] = await db
    .select()
    .from(shiftOffers)
    .where(and(eq(shiftOffers.id, id), eq(shiftOffers.companyId, companyId)))
    .limit(1);
  if (!offer) { res.status(404).json({ error: "Offer not found" }); return; }
  if (offer.status !== "open") { res.status(400).json({ error: "Shift is no longer available" }); return; }
  if (offer.offeredBy === userId) { res.status(400).json({ error: "Cannot take your own offered shift" }); return; }

  // Take the shift — reassign employeeId and mark offer taken
  await db.update(shiftOffers).set({ status: "taken", takenBy: userId, takenAt: new Date() }).where(eq(shiftOffers.id, id));
  await db.update(shifts).set({ employeeId: userId, offerStatus: "taken" }).where(eq(shifts.id, offer.shiftId));

  const [taker] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const [shift] = await db.select({ startTime: shifts.startTime }).from(shifts).where(eq(shifts.id, offer.shiftId)).limit(1);
  const shiftStart = shift ? new Date(shift.startTime).toLocaleString() : "unknown";

  // Notify the original offerer
  await db.insert(notifications).values({
    companyId,
    userId: offer.offeredBy,
    type: "shift_taken",
    title: "Your Shift Was Taken",
    message: `${taker?.name ?? "A colleague"} has taken your offered shift (${shiftStart}).`,
    data: { offerId: offer.id, takenBy: userId },
  });

  // Notify all employees the slot is filled
  const allEmployees = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.status, "active")));

  const filledNotifs = allEmployees
    .filter(e => e.id !== userId && e.id !== offer.offeredBy)
    .map(e => ({
      companyId: companyId!,
      userId: e.id,
      type: "shift_taken",
      title: "Open Shift Filled",
      message: `The shift (${shiftStart}) has been taken by ${taker?.name ?? "a colleague"}.`,
      data: { offerId: offer.id },
    }));
  if (filledNotifs.length > 0) await db.insert(notifications).values(filledNotifs);

  // Notify managers the shift is covered
  const managers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.status, "active")));

  const mgNotifs = managers
    .filter(m => (m.role === "admin" || m.role === "manager") && m.id !== userId && m.id !== offer.offeredBy)
    .map(m => ({
      companyId: companyId!,
      userId: m.id,
      type: "shift_taken",
      title: "✅ Shortage Resolved",
      message: `The offered shift (${shiftStart}) has been taken by ${taker?.name ?? "a colleague"}.`,
      data: { offerId: offer.id, takenBy: userId },
    }));
  if (mgNotifs.length > 0) await db.insert(notifications).values(mgNotifs);

  res.json({ success: true, offerId: offer.id });
});

// DELETE /api/shift-offers/:id — retract an offer
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const [offer] = await db
    .select()
    .from(shiftOffers)
    .where(and(eq(shiftOffers.id, id), eq(shiftOffers.companyId, companyId)))
    .limit(1);
  if (!offer) { res.status(404).json({ error: "Offer not found" }); return; }

  const isManager = role === "admin" || role === "manager";
  if (offer.offeredBy !== userId && !isManager) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (offer.status !== "open") { res.status(400).json({ error: "Cannot retract a non-open offer" }); return; }

  await db.update(shiftOffers).set({ status: "retracted" }).where(eq(shiftOffers.id, id));
  await db.update(shifts).set({ offerStatus: null }).where(eq(shifts.id, offer.shiftId));

  res.status(204).end();
});

export default router;
