import type { Role } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
    rawBody?: string;
    user?: AuthUser;
  }
}

export {};
