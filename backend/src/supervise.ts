import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { loadEnv } from "./config/env";
import { logger } from "./infrastructure/logger";

const children = new Map<string, ChildProcess>();
let stopping = false;

function stillRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function shutdown(exitCode: number): void {
  if (stopping) return;
  stopping = true;
  logger.info({ exitCode }, "stopping API and worker");
  for (const child of children.values()) {
    if (stillRunning(child)) child.kill("SIGTERM");
  }
  const timer = setTimeout(() => {
    for (const child of children.values()) {
      if (stillRunning(child)) child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 15_000);
  timer.unref();
  const wait = setInterval(() => {
    const alive = [...children.values()].some(stillRunning);
    if (!alive) {
      clearInterval(wait);
      clearTimeout(timer);
      process.exit(exitCode);
    }
  }, 200);
}

function start(name: string, script: string): void {
  const child = spawn(process.execPath, [script], { stdio: "inherit", env: process.env });
  children.set(name, child);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    logger.error({ name, code, signal }, "child process exited");
    shutdown(code && code !== 0 ? code : 1);
  });
}

const nodeRequire = createRequire(__filename);

function migrate(): Promise<void> {
  const prismaCli = nodeRequire.resolve("prisma/build/index.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [prismaCli, "migrate", "deploy"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy exited with ${code ?? "no code"}`));
    });
  });
}

async function main(): Promise<void> {
  loadEnv();
  logger.info("applying database migrations");
  await migrate();
  start("api", path.join(__dirname, "index.js"));
  start("worker", path.join(__dirname, "worker.js"));
  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
}

main().catch((err) => {
  logger.error({ err }, "supervisor failed");
  process.exit(1);
});
