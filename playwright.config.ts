import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    headless: true,
  },
});
