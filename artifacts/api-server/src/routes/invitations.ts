import { Router } from "express";
import { db } from "@workspace/db";
import { invitations } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole, maxGrantableRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";
import crypto from "crypto";

const router = Router();
router.use(requireAuth);

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "employee"]).optional(),
  expiresAt: z.string().optional(),
});

// GET /api/invitations
router.get("/", requireRole("admin", "manager"), async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const result = await db
    .select()
    .from(invitations)
    .where(eq(invitations.companyId, companyId));
  res.json(result);
});

// POST /api/invitations
router.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { companyId, userId, role: callerRole } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = createInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const targetRole = parsed.data.role ?? "employee";

  // Enforce role hierarchy: callers cannot grant a role equal to or above their own
  const grantable = maxGrantableRole(callerRole);
  if (!grantable.includes(targetRole as (typeof grantable)[number])) {
    res.status(403).json({
      error: `Your role (${callerRole}) cannot invite someone as ${targetRole}`,
    });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [inv] = await db
    .insert(invitations)
    .values({
      companyId,
      email: parsed.data.email,
      role: targetRole,
      invitedBy: userId,
      token,
      expiresAt,
    })
    .returning();
  res.status(201).json(inv);
});

// GET /api/invitations/:id
router.get("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.companyId, companyId)))
    .limit(1);
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  res.json(inv);
});

// DELETE /api/invitations/:id
router.delete("/:id", requireRole("admin", "manager"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [deleted] = await db
    .delete(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.companyId, companyId)))
    .returning({ id: invitations.id });
  if (!deleted) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  res.status(204).end();
});

export default router;
