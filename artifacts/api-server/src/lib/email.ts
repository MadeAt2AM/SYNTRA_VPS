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
  envelopeFrom?: string,
): Promise<void> {
  // nodemailer 9.0.3 has a regression where passing `envelope` alongside
  // a single-part text/html body can leave the message-level `From:` header
  // empty in the resulting MIME — Haraka-style servers reject those with
  // "550 Missing From header at envelope". We bypass the high-level
  // `sendMail` shortcut and build the MIME ourselves so the From header is
  // always present.
  // MailComposer is not re-exported from the top-level module in
  // nodemailer 9 — pull it from the internal path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MailComposer = (await import("nodemailer/lib/mail-composer/index.js" as string)).default;

  const transporter = buildTransport(smtp);
  const fromAddress =
    envelopeFrom || extractBareAddress(smtp.from) || extractBareAddress(smtp.user);
  const bareFrom = extractBareAddress(smtp.from);

  const composer = new MailComposer({
    from: smtp.from,
    to,
    subject,
    html,
    envelope: {
      from: fromAddress || bareFrom || smtp.user,
      to,
    },
  });
  const message = await new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err: Error | null, buf: Buffer) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
  await transporter.sendMail({
    envelope: {
      from: fromAddress || bareFrom || smtp.user,
      to,
    },
    raw: message,
  } as any);
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
