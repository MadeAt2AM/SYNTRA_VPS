import { Router } from "express";
import { db } from "@workspace/db";
import { leaveRequests } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseId } from "../lib/parse-id";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const createLeaveSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  type: z.enum(["annual", "sick", "unpaid", "other"]).optional(),
  reason: z.string().optional().nullable(),
});

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
});

// GET /api/leave-requests
router.get("/", async (req, res) => {
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  const result = isManager
    ? await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.companyId, companyId))
    : await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.companyId, companyId),
            eq(leaveRequests.employeeId, userId),
          ),
        );
  res.json(result);
});

// POST /api/leave-requests
router.post("/", async (req, res) => {
  const { companyId, userId } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const parsed = createLeaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const [lr] = await db
    .insert(leaveRequests)
    .values({ ...parsed.data, employeeId: userId, companyId })
    .returning();
  res.status(201).json(lr);
});

// GET /api/leave-requests/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [lr] = await db
    .select()
    .from(leaveRequests)
    .where(
      and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, companyId)),
    )
    .limit(1);
  if (!lr) {
    res.status(404).json({ error: "Leave request not found" });
    return;
  }
  const isManager = ["admin", "manager"].includes(role);
  if (!isManager && lr.employeeId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(lr);
});

// PUT /api/leave-requests/:id
router.put("/:id", async (req, res) => {
  const id = parseId(req.params["id"], res);
  if (id === null) return;
  const { companyId, userId, role } = req.auth!;
  if (!companyId) {
    res.status(400).json({ error: "No company associated with this account" });
    return;
  }
  const [lr] = await db
    .select()
    .from(leaveRequests)
    .where(
      and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, companyId)),
    )
    .limit(1);
  if (!lr) {
    res.status(404).json({ error: "Leave request not found" });
    return;
  }

  const isManager = ["admin", "manager"].includes(role);

  if (isManager) {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const [updated] = await db
      .update(leaveRequests)
      .set({
        status: parsed.data.status,
        reviewedBy: userId,
        reviewedAt: new Date(),
      })
      .where(eq(leaveRequests.id, id))
      .returning();
    res.json(updated);
  } else {
    if (lr.employeeId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (lr.status !== "pending") {
      res.status(400).json({ error: "Can only update pending requests" });
      return;
    }
    const parsed = createLeaveSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const [updated] = await db
      .update(leaveRequests)
      .set(parsed.data)
      .where(eq(leaveRequests.id, id))
      .returning();
    res.json(updated);
  }
});

export default router;
