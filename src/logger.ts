import pino, { type LoggerOptions } from "pino";
import { config } from "./config.js";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "*.token",
  "*.accessToken",
  "*.access_token",
  "*.secret",
  "*.password",
  "*.email",
  "*.phone",
  "*.tracking",
];

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: { service: "storefront-voice-ops", env: config.NODE_ENV },
  redact: { paths: redactPaths, censor: "[REDACTED]" },
};

if (config.NODE_ENV === "development") {
  options.transport = {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname,env" },
  };
}

export const logger = pino(options);

/** Redact obvious PII from a free-text string before it is logged. */
export function redactPii(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?\d[\d\s-]{7,}\d)/g, "[phone]");
}
