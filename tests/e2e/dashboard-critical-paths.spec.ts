import { test, expect } from "@playwright/test";

test.describe("Dashboard Critical Paths", () => {
  test.beforeEach(async ({ page }) => {
    // Try to login with demo credentials
    await page.goto("/login");
    
    // Check if login form exists
    const emailField = page.getByLabel("Email");
    if (await emailField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailField.fill("demo@example.com");
      await page.getByLabel("Password").fill("demo12345");
      await page.getByRole("button", { name: /sign in/i }).click();
      
      // Wait for navigation to dashboard
      await page.waitForURL(/dashboard/, { timeout: 5000 }).catch(() => {
        // If login fails, skip to dashboard directly
        return page.goto("/dashboard");
      });
    } else {
      // Already logged in or no auth, go to dashboard
      await page.goto("/dashboard");
    }
  });

  test("sync toggle shows toast feedback on success", async ({ page }) => {
    await page.goto("/dashboard");
    
    // Wait for page to load
    await expect(page.getByRole("heading", { name: "Mail Audit" })).toBeVisible();
    
    // Find and click sync toggle
    const syncToggle = page.getByTestId("sync-toggle");
    await expect(syncToggle).toBeVisible();
    
    await syncToggle.click();
    
    // Should show toast notification
    await expect(page.locator(".sonner-toast")).toBeVisible({ timeout: 3000 });
  });

  test("sync toggle shows toast on error", async ({ page }) => {
    // Mock API failure
    await page.route("**/api/icloud-sync/config", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/dashboard");
    
    const syncToggle = page.getByTestId("sync-toggle");
    await syncToggle.click();
    
    // Should show error toast
    const toast = page.locator(".sonner-toast");
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText("Failed to");
  });

  test("sync toggle prevents double-click", async ({ page }) => {
    await page.goto("/dashboard");
    
    const syncToggle = page.getByTestId("sync-toggle");
    
    // Click twice rapidly
    await syncToggle.click();
    await syncToggle.click();
    
    // Should only make one request (button should be disabled)
    await expect(syncToggle).toBeDisabled();
  });

  test("sign out requires confirmation", async ({ page }) => {
    await page.goto("/dashboard");
    
    // Click sign out
    const signOutButton = page.getByTestId("sign-out-button");
    await signOutButton.click();
    
    // Should show confirmation dialog
    await expect(page.getByTestId("sign-out-confirm")).toBeVisible();
    await expect(page.getByTestId("sign-out-confirm-yes")).toBeVisible();
    await expect(page.getByTestId("sign-out-cancel")).toBeVisible();
    
    // Cancel should dismiss
    await page.getByTestId("sign-out-cancel").click();
    await expect(page.getByTestId("sign-out-confirm")).not.toBeVisible();
    
    // Sign out button should be back
    await expect(signOutButton).toBeVisible();
  });

  test("sign out confirmation actually signs out", async ({ page }) => {
    await page.goto("/dashboard");
    
    await page.getByTestId("sign-out-button").click();
    await page.getByTestId("sign-out-confirm-yes").click();
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });

  test("tab navigation preserves query params", async ({ page }) => {
    await page.goto("/dashboard?q=apple&status=active");
    
    // Click subscriptions tab
    await page.getByTestId("tab-subscriptions").click();
    await expect(page).toHaveURL(/.*tab=subscriptions.*q=apple.*status=active/);
    
    // Click orders tab
    await page.getByTestId("tab-orders").click();
    await expect(page).toHaveURL(/.*tab=orders.*q=apple.*status=active/);
  });

  test("search form works", async ({ page }) => {
    await page.goto("/dashboard");
    
    // Fill search form
    await page.getByTestId("search-merchant").fill("Apple");
    await page.getByTestId("search-status").fill("active");
    await page.getByTestId("search-submit").click();
    
    // URL should have query params
    await expect(page).toHaveURL(/.*q=Apple.*status=active/);
  });

  test("analytics tabs are interactive", async ({ page }) => {
    await page.goto("/dashboard");
    
    // Check if analytics tabs exist (they may not if there's no data)
    const syncTab = page.getByTestId("analytics-tab-sync");
    if (await syncTab.isVisible()) {
      await syncTab.click();
      await expect(syncTab).toHaveClass(/default/); // Active state
      
      const spendingTab = page.getByTestId("analytics-tab-spending");
      await spendingTab.click();
      await expect(spendingTab).toHaveClass(/default/);
    }
  });

  test("error messages are displayed", async ({ page }) => {
    // Mock API error
    await page.route("**/api/icloud-sync/config", (route) => {
      route.fulfill({
        status: 400,
        body: JSON.stringify({ error: "Invalid configuration" }),
      });
    });

    await page.goto("/dashboard");
    
    await page.getByTestId("sync-toggle").click();
    
    // Should show error in UI
    const errorElement = page.getByTestId("sync-error");
    await expect(errorElement).toBeVisible({ timeout: 3000 });
    await expect(errorElement).toContainText("Invalid configuration");
  });

  test("charts render without errors", async ({ page }) => {
    await page.goto("/dashboard");
    
    // Check for chart SVG elements (if analytics data exists)
    const charts = page.locator("svg");
    const chartCount = await charts.count();
    
    if (chartCount > 0) {
      // No "Chart error" text should be visible
      await expect(page.locator("text=Chart error")).not.toBeVisible();
      await expect(page.locator("text=Chart render error")).not.toBeVisible();
    }
  });
});
