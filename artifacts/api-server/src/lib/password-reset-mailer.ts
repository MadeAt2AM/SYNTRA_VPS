/**
 * Resolve the SMTP configuration + reset URL origin to use for a given
 * password-reset attempt. Pure / dependency-free so it can be unit-tested
 * without touching the database.
 *
 * Two return shapes:
 *  - "tenant": tenant user's company supplies the SMTP and may provide a
 *    custom-domain brand. The caller will:
 *      - look up `companies.smtpConfig`
 *      - build the reset URL against the platform host (we can never
 *        cross-origin from the SPA), and the email itself carries the
 *        "go to your own domain" copy.
 *  - "platform": the recipient is a platform_admin. SMTP comes from
 *    `platform_settings.smtpConfig` first, with a fallback to the
 *    `CONTACT_SMTP_*` env vars, so a freshly-deployed system always has
 *    *something* to send through. The reset URL points at the platform host.
 *
 *  - "none": no mailer is configured anywhere. The caller should still
 *    write the token to the DB (so the user can be helped manually) and
 *    emit a structured log line.
 */
export type ResetMailerKind = "tenant" | "platform" | "none";

export interface ResetMailer {
  kind: ResetMailerKind;
  smtp: null | {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    /** Envelope `MAIL FROM:` — SMTP servers reject emails without an address literal here. */
    envelopeFrom: string;
  };
  /** Absolute origin used to build the reset link. Always https://<host> */
  origin: string;
}

export interface PlatformSmtpRead {
  smtpConfig: unknown;
  contactEmailFrom: string | null;
}

export interface EnvLike {
  APP_BASE_URL?: string | undefined;
  REPLIT_DOMAINS?: string | undefined;
  CONTACT_SMTP_HOST?: string | undefined;
  CONTACT_SMTP_PORT?: string | undefined;
  CONTACT_SMTP_SECURE?: string | undefined;
  CONTACT_SMTP_USER?: string | undefined;
  CONTACT_SMTP_PASS?: string | undefined;
  CONTACT_SMTP_FROM?: string | undefined;
  CONTACT_EMAIL_FROM?: string | undefined;
}

/**
 * Extract a bare email address from a `from` string like
 * `SYNTRA Platform <platform@madeat2am.in>` so SMTP servers that enforce
 * envelope-from validation don't reject us. Falls back to the
 * `contactEmailFrom` and finally an explicit value if no angle-bracket
 * version is present.
 */
function envelopeFrom(from: string, fallback?: string | null): string {
  const match = from.match(/<([^<>]+@[^<>]+)>/);
  if (match) return match[1]!.trim();
  const plain = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (plain) return plain[0];
  return (fallback || from || "").trim();
}

function readPlatformSmtp(settings: PlatformSmtpRead | null | undefined): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  envelopeFrom: string;
} | null {
  const cfg = settings?.smtpConfig as
    | { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string }
    | null
    | undefined;
  if (cfg && typeof cfg.host === "string" && typeof cfg.user === "string" && typeof cfg.pass === "string" && typeof cfg.from === "string") {
    const from = settings?.contactEmailFrom || cfg.from;
    return {
      host: cfg.host,
      port: typeof cfg.port === "number" ? cfg.port : 587,
      secure: typeof cfg.secure === "boolean" ? cfg.secure : false,
      user: cfg.user,
      pass: cfg.pass,
      from,
      envelopeFrom: envelopeFrom(from, cfg.user),
    };
  }
  return null;
}

function readEnvSmtp(env: EnvLike): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  envelopeFrom: string;
} | null {
  if (!env.CONTACT_SMTP_HOST || !env.CONTACT_SMTP_USER || !env.CONTACT_SMTP_PASS || !env.CONTACT_SMTP_FROM) {
    return null;
  }
  const from = env.CONTACT_EMAIL_FROM || env.CONTACT_SMTP_FROM;
  return {
    host: env.CONTACT_SMTP_HOST,
    port: env.CONTACT_SMTP_PORT ? Number(env.CONTACT_SMTP_PORT) : 587,
    secure: env.CONTACT_SMTP_SECURE === "true",
    user: env.CONTACT_SMTP_USER,
    pass: env.CONTACT_SMTP_PASS,
    from,
    envelopeFrom: envelopeFrom(from, env.CONTACT_SMTP_USER),
  };
}

function resolveOrigin(env: EnvLike): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, "");
  const first = env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (first) return `https://${first}`;
  return "http://localhost:8080";
}

export interface ResolveArgs {
  userRole: "platform_admin" | "admin" | "manager" | "employee" | (string & {});
  userCompanyId: number | null;
  platformSettings: PlatformSmtpRead | null | undefined;
  env: EnvLike;
}

export function resolveResetMailer(args: ResolveArgs): ResetMailer {
  const origin = resolveOrigin(args.env);

  if (args.userRole === "platform_admin" || args.userCompanyId === null) {
    const smtp = readPlatformSmtp(args.platformSettings) ?? readEnvSmtp(args.env);
    return { kind: smtp ? "platform" : "none", smtp, origin };
  }

  // Tenant: SMTP is owned by the company, looked up by the caller. We only
  // return the origin here; the caller's branch handles the brand/transport.
  return { kind: "tenant", smtp: null, origin };
}
