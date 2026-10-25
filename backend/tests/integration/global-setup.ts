import { execSync } from "node:child_process";
import path from "node:path";

const databaseUrl = "postgresql://payguard:payguard@localhost:5432/payguard_test?schema=public";

export default async function setup(): Promise<void> {
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: "inherit",
  });
}
