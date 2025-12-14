import { test as base } from "@playwright/test";

// Extend the base test with authentication
export const test = base.extend({
  // Auto-authenticate for all tests
  storageState: async ({}, use) => {
    // For now, skip auth - the tests will need to handle login manually
    // TODO: Set up proper auth state with seeded test user
    await use(undefined);
  },
});

export { expect } from "@playwright/test";
