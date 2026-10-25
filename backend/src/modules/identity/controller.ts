import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { sendData } from "../../common/response";
import { issueCsrfToken } from "../../common/middleware/csrf";
import { AppError } from "../../common/errors";
import * as identity from "./service";
import type { LoginBody } from "./validators";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = res.locals.body as LoginBody;
  const session = await identity.login(body, res, req.requestId);
  sendData(res, session);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await identity.logout(
    {
      refreshToken: req.cookies?.payguard_refresh as string | undefined,
      accessToken: req.cookies?.payguard_access as string | undefined,
    },
    res,
    req.requestId,
  );
  sendData(res, { loggedOut: true });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const session = await identity.refresh(req.cookies?.payguard_refresh as string | undefined, res);
  sendData(res, session);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await identity.currentUser(req.user.id);
  sendData(res, { user });
});

export const csrf = asyncHandler(async (req: Request, res: Response) => {
  const existing = req.cookies?.payguard_csrf as string | undefined;
  const csrfToken = issueCsrfToken(res, existing);
  sendData(res, { csrfToken });
});
