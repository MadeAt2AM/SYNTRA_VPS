import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { users, invitations, companies } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, signToken } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
  companyName: z.string().min(1).optional(),
  invitationToken: z.string().min(1).optional(),
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  // Normalize case so "User@Acme.com" and "user@acme.com" are treated as the
  // same identity everywhere (uniqueness check, storage, invitation match).
  const email = parsed.data.email.toLowerCase();
  const { password, name, companyName, invitationToken } = parsed.data;

  if (!companyName && !invitationToken) {
    res.status(400).json({
      error: "Provide either companyName (to create a new company) or invitationToken (to join via invitation)",
    });
    return;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // ── Invitation flow ────────────────────────────────────────────────────
  if (invitationToken) {
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, invitationToken))
      .limit(1);

    if (!invitation) {
      res.status(400).json({ error: "This invitation link is invalid." });
      return;
    }
    if (invitation.status !== "pending") {
      res.status(400).json({ error: "This invitation has already been used or was revoked." });
      return;
    }
    if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: "This invitation has expired. Ask an admin or manager to resend it." });
      return;
    }
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      res.status(400).json({ error: "This invitation was issued to a different email address." });
      return;
    }
    if (!invitation.companyId) {
      res.status(400).json({ error: "This invitation is not associated with a company." });
      return;
    }

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        role: invitation.role,
        companyId: invitation.companyId,
      })
      .returning();

    await db
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.id, invitation.id));

    const token = signToken({ userId: user.id, companyId: user.companyId, role: user.role });
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
    });
    return;
  }

  // ── New company flow — caller becomes the admin/owner ─────────────────
  const [company] = await db
    .insert(companies)
    .values({ name: companyName! })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      role: "admin",
      companyId: company.id,
    })
    .returning();

  const token = signToken({ userId: user.id, companyId: user.companyId, role: user.role });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    },
  });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    await bcrypt.compare(
      password,
      "$2b$12$invalidhashpaddingtomatchtime00000000000000000000000000",
    );
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.status !== "active") {
    res.status(403).json({ error: "Account is not active" });
    return;
  }

  const token = signToken({
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
  });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      companyId: users.companyId,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      hourlyRate: users.hourlyRate,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, req.auth!.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

// POST /api/auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, req.auth!.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (parsed.data.currentPassword && !user.mustChangePassword) {
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const [updated] = await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, req.auth!.userId))
    .returning({ id: users.id, mustChangePassword: users.mustChangePassword });

  res.json({ success: true, mustChangePassword: updated.mustChangePassword });
});

export default router;
