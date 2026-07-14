import { Router } from "express";
import { db } from "@workspace/db";
import { shifts, shiftReplacements, users, companies, notifications } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import crypto from "crypto";
import { sendEmail, type SmtpConfig } from "../lib/email";
import { renderBrandedEmail } from "../lib/email-templates";

const router = Router();
router.use(requireAuth);

const createReplacementSchema = z.object({
  shiftId: z.number().int().positive(),
  targetEmployeeId: z.number().int().positive(),
});

// GET /api/shift-replacements — list replacement requests involving the current user
router.get("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }
  const result = await db
    .select()
    .from(shiftReplacements)
    .where(
      and(
        eq(shiftReplacements.companyId, companyId),
        or(
          eq(shiftReplacements.requestedBy, userId),
          eq(shiftReplacements.targetEmployeeId, userId),
        ),
      ),
    );
  res.json(result);
});

// POST /api/shift-replacements — request a specific colleague to take over a shift
router.post("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const parsed = createReplacementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { shiftId, targetEmployeeId } = parsed.data;

  if (targetEmployeeId === userId) {
    res.status(400).json({ error: "Cannot request yourself as a replacement" });
    return;
  }

  // Validate the shift belongs to the requester and is published
  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.companyId, companyId), eq(shifts.employeeId!, userId)))
    .limit(1);
  if (!shift) { res.status(404).json({ error: "Shift not found or not yours" }); return; }
  if (shift.status !== "published") { res.status(400).json({ error: "Can only request a replacement for published shifts" }); return; }

  // Validate target employee is active, in the same company, and is scheduled staff
  // (admins are company owners, not staff, so they cannot be picked to cover a shift)
  const [targetUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, targetEmployeeId), eq(users.companyId, companyId), eq(users.status, "active")))
    .limit(1);
  if (!targetUser || targetUser.role === "platform_admin" || targetUser.role === "admin") {
    res.status(404).json({ error: "Selected staff member not found" });
    return;
  }

  // No duplicate open request for the same shift
  const [existing] = await db
    .select()
    .from(shiftReplacements)
    .where(and(eq(shiftReplacements.shiftId, shiftId), eq(shiftReplacements.status, "pending")))
    .limit(1);
  if (existing) { res.status(409).json({ error: "A replacement request is already pending for this shift" }); return; }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

  const [replacement] = await db
    .insert(shiftReplacements)
    .values({ companyId, shiftId, requestedBy: userId, targetEmployeeId, token, expiresAt })
    .returning();

  const [requester] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const shiftStart = new Date(shift.startTime).toLocaleString();

  // In-app notification to the chosen replacement
  await db.insert(notifications).values({
    companyId,
    userId: targetEmployeeId,
    type: "replacement_request",
    title: "Shift Replacement Request",
    message: `${requester?.name ?? "A colleague"} wants you to cover their shift (${shiftStart}).`,
    data: { replacementId: replacement.id, shiftId, shiftStart },
  });

  // Email the chosen replacement
  try {
    const [company] = await db
      .select({ name: companies.name, smtpConfig: companies.smtpConfig, logoUrl: companies.logoUrl, logoText: companies.logoText })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company?.smtpConfig && targetUser.email) {
      const smtp = company.smtpConfig as SmtpConfig;
      const appUrl = process.env["APP_URL"] || `${req.protocol}://${req.get("host")}`;
      const acceptUrl = `${appUrl}/api/shift-replacements/token/${token}?action=accept`;
      const rejectUrl = `${appUrl}/api/shift-replacements/token/${token}?action=reject`;

      const html = renderBrandedEmail(
        { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
        `
  <h3 style="color:#111;font-size:18px;font-weight:600;margin:0 0 16px">Shift Replacement Request</h3>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">
    <strong>${requester?.name ?? "A colleague"}</strong> is asking you to cover their shift.
  </p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
    <tr>
      <td style="padding:8px;background:#f5f5f5;border-radius:6px 0 0 6px;font-size:13px;color:#666">Shift</td>
      <td style="padding:8px;font-size:14px;font-weight:600">${shiftStart}</td>
    </tr>
  </table>
  <div style="display:flex;gap:12px;margin:0 0 24px">
    <a href="${acceptUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px">Accept</a>
    <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px">Decline</a>
  </div>
  <p style="color:#aaa;font-size:12px">This request expires in 3 days. You can also respond from the Schedule page.</p>`,
      );

      await sendEmail(smtp, targetUser.email, `Shift Replacement Request from ${requester?.name ?? "a colleague"}`, html);
    }
  } catch (err) {
    req.log?.warn({ err }, "Failed to send replacement email");
  }

  res.status(201).json(replacement);
});

// POST /api/shift-replacements/:id/respond — accept or reject
router.post("/:id/respond", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const actionSchema = z.object({ action: z.enum(["accept", "reject"]) });
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "action must be accept or reject" }); return; }

  const [replacement] = await db
    .select()
    .from(shiftReplacements)
    .where(and(eq(shiftReplacements.id, id), eq(shiftReplacements.companyId, companyId), eq(shiftReplacements.targetEmployeeId, userId)))
    .limit(1);

  if (!replacement) { res.status(404).json({ error: "Request not found or you are not the target" }); return; }
  if (replacement.status !== "pending") { res.status(400).json({ error: `Request is already ${replacement.status}` }); return; }
  if (replacement.expiresAt && new Date(replacement.expiresAt) < new Date()) {
    await db.update(shiftReplacements).set({ status: "expired" }).where(eq(shiftReplacements.id, id));
    res.status(400).json({ error: "Request has expired" });
    return;
  }

  await respondToReplacement(replacement, parsed.data.action, req);

  const [updated] = await db.select().from(shiftReplacements).where(eq(shiftReplacements.id, id)).limit(1);
  res.json(updated);
});

// Public token-based respond (from email link)
// GET /api/shift-replacements/token/:token?action=accept|reject
router.get("/token/:token", async (req, res) => {
  const { token } = req.params;
  const action = req.query["action"] as string;
  if (!token || !["accept", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid token or action" });
    return;
  }

  const [replacement] = await db.select().from(shiftReplacements).where(eq(shiftReplacements.token, token)).limit(1);
  if (!replacement) { res.status(404).json({ error: "Request not found" }); return; }
  if (replacement.status !== "pending") { res.redirect(`/schedule?replacementResult=${replacement.status}`); return; }
  if (replacement.expiresAt && new Date(replacement.expiresAt) < new Date()) {
    await db.update(shiftReplacements).set({ status: "expired" }).where(eq(shiftReplacements.id, replacement.id));
    res.redirect("/schedule?replacementResult=expired");
    return;
  }

  await respondToReplacement(replacement, action as "accept" | "reject", req);

  res.redirect(`/schedule?replacementResult=${action}ed`);
});

// Shared accept/reject logic used by both the authenticated and token-based routes
async function respondToReplacement(
  replacement: typeof shiftReplacements.$inferSelect,
  action: "accept" | "reject",
  req: import("express").Request,
) {
  const companyId = replacement.companyId;

  if (action === "accept") {
    await db.update(shifts).set({ employeeId: replacement.targetEmployeeId }).where(eq(shifts.id, replacement.shiftId));
    await db.update(shiftReplacements).set({ status: "accepted", respondedAt: new Date() }).where(eq(shiftReplacements.id, replacement.id));

    const [targetUser] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, replacement.targetEmployeeId)).limit(1);
    const [requester] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, replacement.requestedBy)).limit(1);
    const [shift] = await db.select({ startTime: shifts.startTime }).from(shifts).where(eq(shifts.id, replacement.shiftId)).limit(1);
    const shiftStart = shift ? new Date(shift.startTime).toLocaleString() : "unknown";

    // Notify requester in-app
    await db.insert(notifications).values({
      companyId,
      userId: replacement.requestedBy,
      type: "replacement_accepted",
      title: "Replacement Accepted",
      message: `${targetUser?.name ?? "Your colleague"} accepted your replacement request and will cover your shift (${shiftStart}).`,
      data: { replacementId: replacement.id },
    });

    // Notify managers/admins the shift has a new owner
    const managers = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.status, "active")));
    const mgNotifs = managers
      .filter(m => (m.role === "admin" || m.role === "manager") && m.id !== replacement.requestedBy && m.id !== replacement.targetEmployeeId)
      .map(m => ({
        companyId,
        userId: m.id,
        type: "replacement_accepted",
        title: "Shift Replacement Confirmed",
        message: `${targetUser?.name ?? "A colleague"} is now covering ${requester?.name ?? "a colleague"}'s shift (${shiftStart}).`,
        data: { replacementId: replacement.id },
      }));
    if (mgNotifs.length > 0) await db.insert(notifications).values(mgNotifs);

    // Email both parties
    try {
      const [company] = await db
        .select({ name: companies.name, smtpConfig: companies.smtpConfig, logoUrl: companies.logoUrl, logoText: companies.logoText })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (company?.smtpConfig) {
        const smtp = company.smtpConfig as SmtpConfig;
        const appUrl = process.env["APP_URL"] || `${req.protocol}://${req.get("host")}`;
        const recipients = [requester?.email, targetUser?.email].filter((e): e is string => !!e);
        const html = renderBrandedEmail(
          { name: company.name, logoUrl: company.logoUrl, logoText: company.logoText },
          `
  <h3 style="color:#111;font-size:18px;font-weight:600;margin:0 0 16px">Shift Replacement Confirmed</h3>
  <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">
    <strong>${targetUser?.name ?? "The replacement"}</strong> will now cover the shift on <strong>${shiftStart}</strong>, originally scheduled for <strong>${requester?.name ?? "the requester"}</strong>.
  </p>
  <div style="text-align:center">
    <a href="${appUrl}/schedule" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px">View Schedule</a>
  </div>`,
        );
        await Promise.allSettled(recipients.map(email => sendEmail(smtp, email, "Shift Replacement Confirmed", html)));
      }
    } catch (err) {
      req.log?.warn({ err }, "Failed to send replacement-confirmed emails");
    }
  } else {
    await db.update(shiftReplacements).set({ status: "rejected", respondedAt: new Date() }).where(eq(shiftReplacements.id, replacement.id));

    const [targetUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, replacement.targetEmployeeId)).limit(1);
    await db.insert(notifications).values({
      companyId,
      userId: replacement.requestedBy,
      type: "replacement_rejected",
      title: "Replacement Declined",
      message: `${targetUser?.name ?? "Your colleague"} declined your replacement request.`,
      data: { replacementId: replacement.id },
    });
  }
}

// DELETE /api/shift-replacements/:id — cancel a pending request (requester only)
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId } = req.auth!;
  if (!companyId) { res.status(400).json({ error: "No company" }); return; }

  const [replacement] = await db
    .select()
    .from(shiftReplacements)
    .where(and(eq(shiftReplacements.id, id), eq(shiftReplacements.companyId, companyId), eq(shiftReplacements.requestedBy, userId)))
    .limit(1);
  if (!replacement) { res.status(404).json({ error: "Request not found" }); return; }
  if (replacement.status !== "pending") { res.status(400).json({ error: "Cannot cancel a request that is no longer pending" }); return; }

  await db.update(shiftReplacements).set({ status: "cancelled" }).where(eq(shiftReplacements.id, id));
  res.status(204).end();
});

export default router;
