import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function buildTransport(smtp: SmtpConfig) {
  const isStartTLS = !smtp.secure && (smtp.port === 587 || smtp.port === 25);
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // requireTLS forces STARTTLS on port 587/25; prevents plain-text fallback.
    // Without this Gmail rejects the connection.
    requireTLS: isStartTLS,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: {
      // Only disable cert verification when explicitly opted out.
      rejectUnauthorized: process.env["SMTP_REJECT_UNAUTHORIZED"] !== "false",
      // Gmail and many providers need TLS 1.2+
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    // Send the raw SMTP transaction to stdout when SYNTRA_SMTP_DEBUG=1 so
    // operators can see exactly what nodemailer sent when an upstream rejects
    // with a confusing 550. Off by default.
    logger: process.env["SYNTRA_SMTP_DEBUG"] === "1",
    debug: process.env["SYNTRA_SMTP_DEBUG"] === "1",
  } as any);
}

export async function sendEmail(
  smtp: SmtpConfig & { envelopeFrom?: string },
  to: string,
  subject: string,
  html: string,
  // Override the SMTP `MAIL FROM:` (envelope) when a tenant or platform
  // mailer's "from" string differs from the SMTP user. Most providers
  // require `MAIL FROM:` to match the authenticated user. When the value
  // matches the from-string we set here, the envelope is omitted so nodemailer
  // does not strip the message-level `From:` header.
  envelopeFrom?: string,
): Promise<void> {
  const bareSmtpUser = extractBareAddress(smtp.user);
  const envelope = envelopeFrom && envelopeFrom !== bareSmtpUser ? envelopeFrom : undefined;
  const transporter = buildTransport(smtp);
  await transporter.sendMail({
    from: smtp.from,
    envelope: envelope ? { from: envelope, to } : undefined,
    to,
    subject,
    html,
  });
}

function extractBareAddress(from: string): string | null {
  const angle = from.match(/<([^<>]+@[^<>]+)>/);
  if (angle) return angle[1]!.trim();
  const plain = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain ? plain[0] : null;
}

export async function testSmtp(smtp: SmtpConfig): Promise<void> {
  const transporter = buildTransport(smtp);
  await transporter.verify();
}
