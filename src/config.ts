import "dotenv/config";
import { z } from "zod";

/**
 * Parse a comma-separated environment value into a trimmed string array.
 */
function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * A boolean environment flag. Accepts 1/true/yes/on (case-insensitive).
 */
function booleanFlag(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return defaultValue;
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  AUTH_MODE: z.enum(["demo", "linked"]).default("demo"),
  MCP_AUTH_TOKEN: z.string().optional().default(""),
  MCP_CANONICAL_URI: z.string().default("http://localhost:3000/mcp"),
  ALLOWED_ORIGINS: z.string().default("").transform(parseCsv),

  /** Public demo: exposes POST /api/demo/reset to reseed the store. Only enable on disposable data. */
  DEMO_MODE: booleanFlag(false),

  CONFIRM_TTL_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  REQUEST_BODY_LIMIT: z.string().default("256kb"),

  STORE_PROVIDER: z.enum(["mock", "shopify", "woocommerce"]).default("mock"),
  SHOPIFY_STORE_DOMAIN: z.string().optional().default(""),
  SHOPIFY_ADMIN_TOKEN: z.string().optional().default(""),
  SHOPIFY_API_VERSION: z.string().default("2026-01"),
  /** Shop currency for money values the Admin API does not label (e.g. product prices). */
  SHOPIFY_CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional()
    .default(""),
  WOO_BASE_URL: z.string().optional().default(""),
  WOO_KEY: z.string().optional().default(""),
  WOO_SECRET: z.string().optional().default(""),

  DB_PATH: z.string().default("./data/storefront.sqlite"),

  USE_BEDROCK: booleanFlag(false),
  BEDROCK_KILL_SWITCH: booleanFlag(false),
  AWS_REGION: z.string().default("us-east-1"),
  BEDROCK_MODEL_ID: z.string().default("us.amazon.nova-lite-v1:0"),
  BEDROCK_GUARDRAIL_ID: z.string().optional().default(""),
  BEDROCK_GUARDRAIL_VERSION: z.string().optional().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsed.error));
  throw new Error("Invalid environment configuration");
}

const env = parsed.data;

const isProduction = env.NODE_ENV === "production";
const host = env.HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1");

export const config = {
  ...env,
  host,
  isProduction,
  isTest: env.NODE_ENV === "test",
  allowedOrigins: env.ALLOWED_ORIGINS,
  /** Bedrock is active only when explicitly enabled and not killed. */
  isBedrockEnabled: env.USE_BEDROCK && !env.BEDROCK_KILL_SWITCH,
} as const;

export type Config = typeof config;
