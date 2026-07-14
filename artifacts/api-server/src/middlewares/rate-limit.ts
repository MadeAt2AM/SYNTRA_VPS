import rateLimit from "express-rate-limit";

/**
 * Rate limiter for authentication endpoints.
 *
 * Two layers:
 *  - ipLimiter:    10 req / 15 min per IP — defeats brute-force on /login
 *  - emailLimiter: 5 req / 15 min per email — defeats credential-stuffing
 *                  attacks where a bot rotates IPs
 *
 * Both share a 15-minute window so a determined attacker who rotates IPs
 * still hits the email limit after 5 attempts.
 */
export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

export const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts for this account. Please try again in 15 minutes." },
});

/** General API limiter — generous, prevents accidental DoS. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});