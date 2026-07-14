import { Router } from "express";
import { db } from "@workspace/db";
import { notifications } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";

const router = Router();
router.use(requireAuth);

// GET /api/notifications — list for the current user
router.get("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated" });
    return;
  }
  const result = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.companyId, companyId), eq(notifications.userId, userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  res.json(result);
});

// PUT /api/notifications/:id/read — mark one as read
router.put("/:id/read", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated" });
    return;
  }
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        eq(notifications.companyId, companyId),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(updated);
});

// PUT /api/notifications/read-all — mark all as read
router.put("/read-all", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated" });
    return;
  }
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.companyId, companyId),
        eq(notifications.userId, userId),
      ),
    );
  res.json({ success: true });
});

export default router;
