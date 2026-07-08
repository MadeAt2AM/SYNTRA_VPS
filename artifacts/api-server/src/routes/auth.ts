import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { users, companies, invitations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, signToken } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  /**
   * Self-registration without an invitation: creates a new company and makes
   * this user its owner (role = admin).
   */
  companyName: z.string().min(1).optional(),
  /**
   * Invitation-based registration: joins an existing company with the role
   * specified in the invitation. The registering email MUST match the
   * invitation email.
   */
  invitationToken: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password, name, companyName, invitationToken } = parsed.data;

  // Platform admin accounts can only be created by seeding — never via the
  // public registration endpoint.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let companyId: number | null = null;
  let role = "employee";

  if (invitationToken) {
    const [inv] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, invitationToken))
      .limit(1);

    if (!inv || inv.status !== "pending") {
      res.status(400).json({ error: "Invalid or expired invitation" });
      return;
    }
    if (inv.expiresAt && inv.expiresAt < new Date()) {
      res.status(400).json({ error: "Invitation has expired" });
      return;
    }
    // Security: registering email must match the invitation email
    if (inv.email.toLowerCase() !== email.toLowerCase()) {
      res.status(403).json({
        error: "This invitation was sent to a different email address",
      });
      return;
    }
    // Block invitation-based promotion to platform_admin
    if (inv.role === "platform_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    companyId = inv.companyId;
    role = inv.role;
    await db
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.id, inv.id));
  } else if (companyName) {
    // Self-registration: new company, caller becomes its owner (admin)
    const [company] = await db
      .insert(companies)
      .values({ name: companyName })
      .returning();
    companyId = company.id;
    role = "admin";
  } else {
    res.status(400).json({
      error: "Provide either companyName (new company) or invitationToken",
    });
    return;
  }

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name, companyId, role })
    .returning();

  const token = signToken({ userId: user.id, companyId, role });
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role, companyId },
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
    // Constant-time rejection — prevents user enumeration
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

export default router;
