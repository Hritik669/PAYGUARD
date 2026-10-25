import pino from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info");
const pretty = process.env.NODE_ENV === "development";

export const logger = pino({
  level,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-sandbox-signature']",
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "accessToken",
      "refreshToken",
      "token",
      "csrfToken",
      "*.csrfToken",
    ],
    censor: "[Redacted]",
  },
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});
