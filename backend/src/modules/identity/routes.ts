import { Router } from "express";
import { loadEnv } from "../../config/env";
import { rateLimit } from "../../common/middleware/rate-limit";
import { validateBody } from "../../common/middleware/validate";
import { authenticate } from "../../common/middleware/authenticate";
import { loginBodySchema, registerBodySchema } from "./validators";
import * as controller from "./controller";

export const identityRouter = Router();

identityRouter.get("/csrf", controller.csrf);

identityRouter.post(
  "/register",
  rateLimit({
    name: "register",
    limit: loadEnv().LOGIN_RATE_LIMIT_MAX,
    windowSeconds: loadEnv().LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => req.ip ?? "unknown",
  }),
  validateBody(registerBodySchema),
  controller.register,
);

identityRouter.post(
  "/login",
  rateLimit({
    name: "login",
    limit: loadEnv().LOGIN_RATE_LIMIT_MAX,
    windowSeconds: loadEnv().LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => req.ip ?? "unknown",
  }),
  validateBody(loginBodySchema),
  controller.login,
);

identityRouter.post("/refresh", controller.refresh);
identityRouter.post("/logout", controller.logout);
identityRouter.get("/me", authenticate, controller.me);
