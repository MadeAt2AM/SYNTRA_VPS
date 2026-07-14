import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, shiftSwaps, users, companies, notifications } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import crypto from "crypto";
import { sendEmail, SmtpConfig } from "../lib/email";
import { renderBrandedEmail } from "../lib/email-templates";

const router = Router();
router.use(requireAuth);

const createSwapSchema = z.object({
  myShiftId: z.number().int().positive(),
  targetShiftId: z.number().int().positive(),
});

// GET /api/shift-swaps — list swaps involving the current user
router.get("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }
  const result = await db
    .select()
    .from(shiftSwaps)
    .where(
      and(
        eq(shiftSwaps.companyId, companyId),
        or(
          eq(shiftSwaps.requesterId, userId),
          eq(shiftSwaps.targetEmployeeId, userId),
        ),
      ),
    );
  res.json(result);
});

// POST /api/shift-swaps — request a swap
router.post("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const parsed = createSwapSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { myShiftId, targetShiftId } = parsed.data;

  // Validate my shift belongs to me and is published
  const [myShift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, myShiftId), eq(shifts.companyId, companyId), eq(shifts.employeeId!, userId)))
    .limit(1);
  if (!myShift) { res.status(404).json({ error: "Your shift not found or not published" }); return; }
  if (myShift.status !== "published") { res.status(400).json({ error: "Can only swap published shifts" }); return; }

  // Validate target shift is published and belongs to another employee in same company
  const [targetShift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, targetShiftId), eq(shifts.companyId, companyId)))
    .limit(1);
  if (!targetShift) { res.status(404).json({ error: "Target shift not found" }); return; }
  if (targetShift.status !== "published") { res.status(400).json({ error: "Target shift must be published" }); return; }
  if (!targetShift.employeeId || targetShift.employeeId === userId) {
    res.status(400).json({ error: "Cannot swap with an unassigned shift or your own shift" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

  const [swap] = await db
    .insert(shiftSwaps)
    .values({
      companyId,
      requesterId: userId,
      requesterShiftId: myShiftId,
      targetEmployeeId: targetShift.employeeId,
      targetShiftId,
      token,
      expiresAt,
    })
    .returning();

  // Get users for notification
  const [requester] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const [targetUser] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, targetShift.employeeId)).limit(1);

  const myStart = new Date(myShift.startTime).toLocaleString();
  const targetStart = new Date(targetShift.startTime).toLocaleString();

  // In-app notification to target employee
  await db.insert(notifications).values({
    companyId,
    userId: targetShift.employeeId,
    type: "swap_request",
    title: "Shift Swap Request",
    message: `${requester?.name ?? "A colleague"} wants to swap their shift (${myStart}) with your shift (${targetStart}).`,
    data: { swapId: swap.id, myShiftId, targetShiftId },
  });

  // Email target employee
  try {
    const [company] = await db
      .select({ name: companies.name, smtpConfig: companies.smtpConfig, logoUrl: companies.logoUrl, logoText: companies.logoText })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company?.smtpConfig && targetUser?.email) {
      const smtp = company.smtpConfig as SmtpConfig;
      const appUrl = process.env["APP_URL"] || `${req.protocol}://${req.get("host")}`;
      const acceptUrl = `${appUrl}/schedule?swapToken=${token}&action=accept`;
      const rejectUrl = `${appUrl}/schedule?swapToken=${token}&action=reject`;

      const html = renderBrandedEmail(
        { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
        `
  <h3 style="color:#111;font-size:18px;font-weight:600;margin:0 0 16px">Shift Swap Request</h3>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">
    <strong>${requester?.name ?? "A colleague"}</strong> would like to swap shifts with you.
  </p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
    <tr>
      <td style="padding:8px;background:#f5f5f5;border-radius:6px 0 0 6px;font-size:13px;color:#666">Their shift</td>
      <td style="padding:8px;font-size:14px;font-weight:600">${myStart}</td>
    </tr>
    <tr>
      <td style="padding:8px;font-size:13px;color:#666">Your shift</td>
      <td style="padding:8px;font-size:14px;font-weight:600">${targetStart}</td>
    </tr>
  </table>
  <div style="display:flex;gap:12px;margin:0 0 24px">
    <a href="${acceptUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px">Accept Swap</a>
    <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px">Decline</a>
  </div>
  <p style="color:#aaa;font-size:12px">This request expires in 3 days. You can also respond from the Schedule page.</p>`,
      );

      await sendEmail(smtp, targetUser.email, `Shift Swap Request from ${requester?.name ?? "a colleague"}`, html);
    }
  } catch (err) {
    req.log?.warn({ err }, "Failed to send swap email");
  }

  res.status(201).json(swap);
});

// POST /api/shift-swaps/:id/respond — accept or reject
router.post("/:id/respond", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const actionSchema = z.object({ action: z.enum(["accept", "reject"]) });
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "action must be accept or reject" }); return; }

  const [swap] = await db
    .select()
    .from(shiftSwaps)
    .where(and(eq(shiftSwaps.id, id), eq(shiftSwaps.companyId, companyId), eq(shiftSwaps.targetEmployeeId, userId)))
    .limit(1);

  if (!swap) { res.status(404).json({ error: "Swap not found or you are not the target" }); return; }
  if (swap.status !== "pending") { res.status(400).json({ error: `Swap is already ${swap.status}` }); return; }
  if (swap.expiresAt && new Date(swap.expiresAt) < new Date()) {
    await db.update(shiftSwaps).set({ status: "expired" }).where(eq(shiftSwaps.id, id));
    res.status(400).json({ error: "Swap request has expired" });
    return;
  }

  if (parsed.data.action === "accept") {
    // Swap the employeeIds on both shifts
    await db.update(shifts).set({ employeeId: swap.targetEmployeeId }).where(eq(shifts.id, swap.requesterShiftId));
    await db.update(shifts).set({ employeeId: swap.requesterId }).where(eq(shifts.id, swap.targetShiftId));
    await db.update(shiftSwaps).set({ status: "accepted", respondedAt: new Date() }).where(eq(shiftSwaps.id, id));

    // Notify requester
    const [targetUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    await db.insert(notifications).values({
      companyId,
      userId: swap.requesterId,
      type: "swap_accepted",
      title: "Shift Swap Accepted",
      message: `${targetUser?.name ?? "Your colleague"} accepted your shift swap request.`,
      data: { swapId: swap.id },
    });

    // Notify managers/admins
    const managers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.status, "active")));

    const managerNotifs = managers
      .filter(m => m.id !== swap.requesterId && m.id !== userId)
      .map(m => ({
        companyId: companyId!,
        userId: m.id,
        type: "swap_accepted",
        title: "Shift Swap Confirmed",
        message: `A shift swap has been confirmed between two team members.`,
        data: { swapId: swap.id },
      }));
    if (managerNotifs.length > 0) await db.insert(notifications).values(managerNotifs);
  } else {
    await db.update(shiftSwaps).set({ status: "rejected", respondedAt: new Date() }).where(eq(shiftSwaps.id, id));

    const [targetUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    await db.insert(notifications).values({
      companyId,
      userId: swap.requesterId,
      type: "swap_rejected",
      title: "Shift Swap Declined",
      message: `${targetUser?.name ?? "Your colleague"} declined your shift swap request.`,
      data: { swapId: swap.id },
    });
  }

  const [updated] = await db.select().from(shiftSwaps).where(eq(shiftSwaps.id, id)).limit(1);
  res.json(updated);
});

// Public token-based respond (from email link)
// GET /api/shift-swaps/token/:token?action=accept|reject
router.get("/token/:token", async (req, res) => {
  const { token } = req.params;
  const action = req.query["action"] as string;
  if (!token || !["accept", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid token or action" });
    return;
  }

  const [swap] = await db.select().from(shiftSwaps).where(eq(shiftSwaps.token, token)).limit(1);
  if (!swap) { res.status(404).json({ error: "Swap not found" }); return; }
  if (swap.status !== "pending") { res.redirect(`/schedule?swapResult=${swap.status}`); return; }
  if (swap.expiresAt && new Date(swap.expiresAt) < new Date()) {
    await db.update(shiftSwaps).set({ status: "expired" }).where(eq(shiftSwaps.id, swap.id));
    res.redirect("/schedule?swapResult=expired");
    return;
  }

  if (action === "accept") {
    await db.update(shifts).set({ employeeId: swap.targetEmployeeId }).where(eq(shifts.id, swap.requesterShiftId));
    await db.update(shifts).set({ employeeId: swap.requesterId }).where(eq(shifts.id, swap.targetShiftId));
    await db.update(shiftSwaps).set({ status: "accepted", respondedAt: new Date() }).where(eq(shiftSwaps.id, swap.id));

    await db.insert(notifications).values({
      companyId: swap.companyId,
      userId: swap.requesterId,
      type: "swap_accepted",
      title: "Shift Swap Accepted",
      message: "Your shift swap request was accepted.",
      data: { swapId: swap.id },
    });
  } else {
    await db.update(shiftSwaps).set({ status: "rejected", respondedAt: new Date() }).where(eq(shiftSwaps.id, swap.id));
    await db.insert(notifications).values({
      companyId: swap.companyId,
      userId: swap.requesterId,
      type: "swap_rejected",
      title: "Shift Swap Declined",
      message: "Your shift swap request was declined.",
      data: { swapId: swap.id },
    });
  }

  res.redirect(`/schedule?swapResult=${action}ed`);
});

export default router;
