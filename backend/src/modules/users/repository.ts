import { getPrisma } from "../../infrastructure/prisma";

const publicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function findUserByEmail(email: string) {
  return getPrisma().user.findUnique({ where: { email } });
}

export async function findUserById(id: string) {
  return getPrisma().user.findUnique({ where: { id }, select: publicSelect });
}
