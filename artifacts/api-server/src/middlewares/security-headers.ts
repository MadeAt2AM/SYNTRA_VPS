import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Security headers middleware. Sets OWASP-recommended headers on every
 * response, including for static assets and error responses.
 *
 * Note: Caddy also emits security headers (see /srv/caddy/sites/*.caddy) —
 * the two layers are deliberately redundant: if Caddy is bypassed (direct
 * container access during debugging) the API still responds safely.
 */
export function securityHeaders(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Defense-in-depth CSP — primarily for the /api routes. The SPA's
    // own CSP is set by the Nginx web server (nginx/nginx.conf) and Caddy.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    // HSTS only meaningful over HTTPS; safe to set always.
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    next();
  };
}