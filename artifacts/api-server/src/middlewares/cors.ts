import cors from "cors";

/**
 * CORS policy: deny by default, allow same-origin and the configured public
 * domains explicitly.
 *
 * Read ALLOWED_ORIGINS from env (comma-separated). Falls back to the public
 * ALB / Caddy hostnames that match this deployment.
 */
export function buildCors(): ReturnType<typeof cors> {
  const fallback = [
    "https://syntra.terrybot.top",
  ];
  const fromEnv = (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = fromEnv.length > 0 ? fromEnv : fallback;

  return cors({
    origin: (origin, cb) => {
      // Same-origin requests (no Origin header) and curl/server-to-server are allowed.
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
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