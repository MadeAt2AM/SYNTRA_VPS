import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import platformRouter from "./platform";
import usersRouter from "./users";
import companiesRouter from "./companies";
import workplacesRouter from "./workplaces";
import shiftsRouter from "./shifts";
import availabilityRouter from "./availability";
import leaveRequestsRouter from "./leave-requests";
import timeLogsRouter from "./time-logs";
import invitationsRouter from "./invitations";
import { z } from "zod";
import { sendEmail } from "../lib/email";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/platform", platformRouter);
router.use("/users", usersRouter);
router.use("/companies", companiesRouter);
router.use("/workplaces", workplacesRouter);
router.use("/shifts", shiftsRouter);
router.use("/availability", availabilityRouter);
router.use("/leave-requests", leaveRequestsRouter);
router.use("/time-logs", timeLogsRouter);
router.use("/invitations", invitationsRouter);

// Public contact/enquiry endpoint
const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().min(1),
});

router.post("/contact", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, email, company, message } = parsed.data;

  // Send email via env-configured SMTP
  try {
    const smtpHost = process.env["CONTACT_SMTP_HOST"];
    const smtpPort = parseInt(process.env["CONTACT_SMTP_PORT"] ?? "587", 10);
    const smtpUser = process.env["CONTACT_SMTP_USER"];
    const smtpPass = process.env["CONTACT_SMTP_PASS"];
    const emailTo = process.env["CONTACT_EMAIL_TO"] ?? "chris@madeat2am.in";
    const emailFrom = process.env["CONTACT_EMAIL_FROM"] ?? `SYNTRA Enquiries <${smtpUser}>`;

    if (smtpHost && smtpUser && smtpPass) {
      const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f9f9f9;padding:40px 0;margin:0;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:40px;border:1px solid #e5e5e5;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#e11d48;color:#fff;font-weight:700;font-size:18px;letter-spacing:2px;padding:10px 18px;border-radius:8px;">SY</div>
      <h2 style="color:#111;margin:12px 0 4px;font-size:20px;font-weight:700;">SYNTRA</h2>
      <p style="color:#666;font-size:11px;margin:0;letter-spacing:2px;text-transform:uppercase;">New Website Enquiry</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;font-size:13px;color:#555;font-weight:600;width:120px;">Name</td><td style="padding:8px 0;font-size:14px;color:#111;">${name}</td></tr>
      <tr><td style="padding:8px 0;font-size:13px;color:#555;font-weight:600;">Email</td><td style="padding:8px 0;font-size:14px;"><a href="mailto:${email}" style="color:#e11d48;">${email}</a></td></tr>
      ${company ? `<tr><td style="padding:8px 0;font-size:13px;color:#555;font-weight:600;">Company</td><td style="padding:8px 0;font-size:14px;color:#111;">${company}</td></tr>` : ""}
    </table>
    <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="font-size:13px;color:#555;font-weight:600;margin:0 0 8px;">Message</p>
      <p style="font-size:14px;color:#222;line-height:1.6;margin:0;white-space:pre-wrap;">${message}</p>
    </div>
    <p style="color:#aaa;font-size:11px;text-align:center;margin:0;">Submitted via SYNTRA website enquiry form</p>
  </div>
</body>
</html>`;

      await sendEmail(
        { host: smtpHost, port: smtpPort, secure: false, user: smtpUser, pass: smtpPass, from: emailFrom },
        emailTo,
        `New SYNTRA Enquiry from ${name}${company ? ` (${company})` : ""}`,
        html,
      );
    }
  } catch (err) {
    // Log but don't fail the response — enquiry is still recorded
    console.error("[Contact form] Email send failed:", err);
  }

  res.json({ success: true, message: "Thank you for your enquiry. We will be in touch shortly." });
});

export default router;
