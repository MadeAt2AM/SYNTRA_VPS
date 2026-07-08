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

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/platform", platformRouter);   // platform_admin only
router.use("/users", usersRouter);
router.use("/companies", companiesRouter);
router.use("/workplaces", workplacesRouter);
router.use("/shifts", shiftsRouter);
router.use("/availability", availabilityRouter);
router.use("/leave-requests", leaveRequestsRouter);
router.use("/time-logs", timeLogsRouter);
router.use("/invitations", invitationsRouter);

export default router;
