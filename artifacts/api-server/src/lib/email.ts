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
  const isGmail = smtp.host.toLowerCase().includes("gmail");
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: isGmail ? undefined : { rejectUnauthorized: false },
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
