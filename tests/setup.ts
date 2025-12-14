(process.env as any).NODE_ENV ??= "test";

process.env.APP_URL ??= "http://localhost:3000";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-please-change-1234567890";

process.env.DATABASE_URL ??= "postgresql://mailaudit:mailaudit@localhost:5432/mailaudit?schema=public";

process.env.WEBHOOK_SECRET ??= "test-webhook-secret";
process.env.DEV_WEBHOOK_SECRET ??= "dev-inbound-secret";

process.env.OLLAMA_BASE_URL ??= "http://127.0.0.1:11434";
process.env.OLLAMA_MODEL ??= "mistral";

process.env.ENABLE_RAW_EMAIL_STORAGE ??= "false";
process.env.RAW_EMAIL_TTL_DAYS ??= "7";

process.env.INBOUND_MAX_BYTES ??= "262144";
process.env.LLM_TIMEOUT_MS ??= "30000";
