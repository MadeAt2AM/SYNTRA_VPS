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
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    // TLS certificate validation is enforced by default.
    // Only disable if your SMTP host uses a self-signed cert AND you
    // explicitly set SMTP_REJECT_UNAUTHORIZED=false in your environment.
    tls: {
      rejectUnauthorized: process.env["SMTP_REJECT_UNAUTHORIZED"] !== "false",
    },
  });
}

export async function sendEmail(
  smtp: SmtpConfig,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const transporter = buildTransport(smtp);
  await transporter.sendMail({ from: smtp.from, to, subject, html });
}

export async function testSmtp(smtp: SmtpConfig): Promise<void> {
  const transporter = buildTransport(smtp);
  await transporter.verify();
}
