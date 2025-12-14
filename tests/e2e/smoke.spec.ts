import { test, expect } from "@playwright/test";

test("login and dashboard loads", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Mail Audit" })).toBeVisible();
});
