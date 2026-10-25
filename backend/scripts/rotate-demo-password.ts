import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.EMAIL?.trim().toLowerCase();
  const password = process.env.NEW_PASSWORD;
  const disable = process.env.DISABLE_ACCOUNT === "true";
  if (!email) throw new Error("Set EMAIL to the demo account you want to change.");
  if (!disable && (!password || password.length < 12)) {
    throw new Error("Set NEW_PASSWORD to at least 12 characters, or set DISABLE_ACCOUNT=true.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No user exists for that email.");

  if (disable) {
    await prisma.refreshSession.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("Disabled demo account and revoked its sessions. Audit rows remain, without the actor.");
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password!, 10) },
  });
  await prisma.refreshSession.deleteMany({ where: { userId: user.id } });
  console.log("Updated the password and revoked existing sessions.");
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Password rotation failed.";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
