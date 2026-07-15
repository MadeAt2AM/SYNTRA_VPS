import cors from "cors";
import { getCustomDomainHosts, getPlatformTargets } from "../lib/domain";

/**
 * CORS policy: deny by default, allow same-origin and the configured public
 * domains explicitly.
 *
 * Sources (merged, de-duped):
 *   - `ALLOWED_ORIGINS` env var  (comma-separated, e.g. "https://a.com,https://b.com")
 *   - the platform base URL derived from REPLIT_DOMAINS / REPLIT_DEV_DOMAIN / APP_BASE_URL
 *   - every verified custom-domain host via `getCustomDomainHosts()`
 *
 * Read ALLOWED_ORIGINS from env (comma-separated). Falls back to the public
 * ALB / Caddy hostnames that match this deployment.
 */
export function buildCors(): ReturnType<typeof cors> {
  const allowed = new Set<string>();
  for (const o of (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    allowed.add(o);
  }
  for (const host of getPlatformTargets()) {
    allowed.add(`https://${host}`);
  }
  for (const host of getCustomDomainHosts()) {
    allowed.add(`https://${host}`);
  }
  if (allowed.size === 0) {
    // Last-resort: bare minimum so a fresh deploy doesn't 500 on CORS.
    // Operator can replace this by populating ALLOWED_ORIGINS or
    // /srv/secrets/syntra-custom-domains.
    allowed.add("https://syntra.terrybot.top");
  }

  return cors({
    origin: (origin, cb) => {
      // Same-origin requests (no Origin header) and curl/server-to-server are allowed.
      if (!origin) return cb(null, true);
      if (allowed.has(origin)) return cb(null, true);
      // Don't throw — return an explicit false so the request never reaches
      // the handler. Browsers will see the missing Access-Control-Allow-Origin
      // and block the response; non-browser clients get a CORS error.
      return cb(null, false);
    },
    credentials: false, // we use Bearer tokens, not cookies
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  });
}