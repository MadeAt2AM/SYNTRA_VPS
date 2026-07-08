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
  console.log("[SYNTRA Contact Enquiry]", parsed.data);
  res.json({ success: true, message: "Thank you for your enquiry. We will be in touch shortly." });
});

export default router;
