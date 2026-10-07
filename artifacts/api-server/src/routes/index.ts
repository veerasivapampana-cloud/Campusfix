import { Router, type IRouter } from "express";
import campusFixRouter from "./campusfix";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campusFixRouter);

export default router;
