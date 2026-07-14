import express, { type Express, type Request, type Response, type NextFunction } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildCors } from "./middlewares/cors";
import { securityHeaders } from "./middlewares/security-headers";
import { apiLimiter } from "./middlewares/rate-limit";

const app: Express = express();

// Express sits behind Caddy (reverse proxy). trust proxy so that
// express-rate-limit sees the real client IP from X-Forwarded-For instead of
// the proxy's. Single hop only — never trust X-Forwarded-For from the public
// internet directly.
app.set("trust proxy", 1);

// Disable Express fingerprinting — also disabled by Caddy but defense in depth.
app.disable("x-powered-by");

// Request logging — Pino. The serializer below intentionally drops the
// request body, query string, and headers to prevent accidental logging of
// credentials / PII.
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
          // deliberately NOT including: headers, body, remoteAddress
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// CORS — explicit allowlist, no wildcard.
app.use(buildCors());

// Security headers on every response.
app.use(securityHeaders());

// Body parsers — limit payload size to defend against memory-exhaustion /
// large-payload DoS.
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// General API rate limiter (cheap per-request overhead).
app.use("/api", apiLimiter);

// Routes
app.use("/api", router);

// 404 handler — explicit JSON shape so clients don't accidentally render HTML.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler — never leaks stack traces or internal paths to clients.
// The full error goes to logs (above); the client only sees a generic message
// unless the error is a known typed error with a safe message.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  // Don't leak `err.message` for unknown errors — could include DB connection
  // strings, file paths, stack traces, etc. Known API errors set their own
  // status + body upstream and never reach this handler.
  res.status(500).json({ error: "Internal server error" });
});

export default app;