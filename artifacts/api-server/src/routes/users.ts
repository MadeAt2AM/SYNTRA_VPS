import { Router } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  hourlyRate: z.string().optional().nullable(),
  role: z.enum(["admin", "manager", "employee"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  avatarUrl: z.string().optional().nullable(),
});

const userFields = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  status: users.status,
  phone: users.phone,
  hourlyRate: users.hourlyRate,
  avatarUrl: users.avatarUrl,
  companyId: users.companyId,
  createdAt: users.createdAt,
};

// GET /api/users
router.get("/", async (req, res) => {
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const result = await db
    .select(userFields)
    .from(users)
    .where(eq(users.companyId, companyId));
  res.json(result);
});

// GET /api/users/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [user] = await db
    .select(userFields)
    .from(users)
    .where(and(eq(users.id, id), eq(users.companyId, companyId)))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

// PUT /api/users/:id
router.put("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  if (id !== userId && !["admin", "manager"].includes(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updates = { ...parsed.data };
  if (updates.role && role !== "admin") {
    delete updates.role;
  }
  const [updated] = await db
    .update(users)
    .set(updates)
    .where(and(eq(users.id, id), eq(users.companyId, companyId)))
    .returning(userFields);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(updated);
});

// DELETE /api/users/:id — admin only
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId } = req.auth!;
  if (id === userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  const [deleted] = await db
    .delete(users)
    .where(and(eq(users.id, id), eq(users.companyId, companyId!)))
    .returning({ id: users.id });
  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.status(204).end();
});

export default router;
