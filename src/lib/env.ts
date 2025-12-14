import { z } from "zod";

function parseBool(input: unknown, defaultValue: boolean) {
  if (input === undefined || input === null || input === "") return defaultValue;
  if (typeof input === "boolean") return input;
  if (typeof input !== "string") return defaultValue;
  const v = input.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(v)) return true;
  if (["false", "0", "no", "n", "off"].includes(v)) return false;
  return defaultValue;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(20),
  DATABASE_URL: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(8),
  DEV_WEBHOOK_SECRET: z.string().optional(),
  FORWARD_TO: z.string().min(3).default("audit-demo@mail.audit.local"),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("llama3.2"),
  ENABLE_RAW_EMAIL_STORAGE: z.preprocess((v) => parseBool(v, false), z.boolean()),
  RAW_EMAIL_ENCRYPTION_KEY_BASE64: z.string().optional(),
  RAW_EMAIL_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  INBOUND_MAX_BYTES: z.coerce.number().int().min(1024).max(2_000_000).default(262144),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  // iCloud IMAP (app-specific password required)
  ICLOUD_EMAIL: z.string().email().optional(),
  ICLOUD_APP_PASSWORD: z.string().min(8).optional(),
  ICLOUD_MAILBOX: z.string().default("INBOX"),
  ICLOUD_LIMIT: z.coerce.number().int().min(1).max(5000).default(250),
  ICLOUD_SINCE_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  ICLOUD_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(720).default(30),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = envSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    DEV_WEBHOOK_SECRET: process.env.DEV_WEBHOOK_SECRET,
    FORWARD_TO: process.env.FORWARD_TO,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    ENABLE_RAW_EMAIL_STORAGE: process.env.ENABLE_RAW_EMAIL_STORAGE,
    RAW_EMAIL_ENCRYPTION_KEY_BASE64: process.env.RAW_EMAIL_ENCRYPTION_KEY_BASE64,
    RAW_EMAIL_TTL_DAYS: process.env.RAW_EMAIL_TTL_DAYS,
    INBOUND_MAX_BYTES: process.env.INBOUND_MAX_BYTES,
    LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS,
    ICLOUD_EMAIL: process.env.ICLOUD_EMAIL,
    ICLOUD_APP_PASSWORD: process.env.ICLOUD_APP_PASSWORD,
    ICLOUD_MAILBOX: process.env.ICLOUD_MAILBOX,
    ICLOUD_LIMIT: process.env.ICLOUD_LIMIT,
    ICLOUD_SINCE_DAYS: process.env.ICLOUD_SINCE_DAYS,
    ICLOUD_SYNC_INTERVAL_MINUTES: process.env.ICLOUD_SYNC_INTERVAL_MINUTES,
  });
  return cachedEnv;
}

// Keep existing call sites (`env.FOO`) working while deferring parsing until first use.
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    const e = getEnv() as any;
    return e[prop];
  },
});
