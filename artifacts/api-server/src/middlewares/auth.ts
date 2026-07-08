import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  userId: number;
  companyId: number | null;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

/**
 * Valid roles, ordered from most to least privileged.
 *
 * platform_admin — Replit / SaaS operator; no company affiliation; can manage
 *                  all companies and users via /api/platform/* routes only.
 * admin          — Company owner; created by platform_admin or self-registers;
 *                  full access within their company.
 * manager        — Added by owner; can manage shifts, staff, and leave for
 *                  their company.
 * employee       — Staff; can view own schedule, clock in/out, submit leave.
 */
export const ROLES = ["platform_admin", "admin", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable is not set. Server cannot start without a JWT signing key.",
    );
  }
  return secret;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

/** Require any authenticated user. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Require the caller to hold one of the listed roles.
 * NOTE: platform_admin is NOT automatically allowed through here — they must
 * use /api/platform/* routes. This prevents accidental data leakage from
 * company-scoped routes when companyId is null.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Restrict a route to platform_admin only. */
export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.auth || req.auth.role !== "platform_admin") {
    res.status(403).json({ error: "Platform admin access required" });
    return;
  }
  next();
}

/**
 * Return the maximum role a caller is allowed to grant in an invitation.
 * platform_admin → any role
 * admin (owner)  → manager, employee
 * manager        → employee only
 * employee       → none
 */
export function maxGrantableRole(callerRole: string): Role[] {
  switch (callerRole) {
    case "platform_admin":
      return ["platform_admin", "admin", "manager", "employee"];
    case "admin":
      return ["manager", "employee"];
    case "manager":
      return ["employee"];
    default:
      return [];
  }
}
