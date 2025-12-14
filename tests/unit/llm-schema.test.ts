import { describe, expect, test } from "vitest";
import { llmJsonSchema } from "@/lib/parsing/schema";

describe("llmJsonSchema", () => {
  test("accepts valid JSON output", () => {
    const parsed = llmJsonSchema.parse({
      type: "order",
      merchant: "Stripe",
      product: "unknown",
      amount: 120,
      currency: "USD",
      transaction_date: "2025-12-01",
      renewal_date: null,
      is_recurring: false,
      cancel_url: null,
      confidence: 0.82,
      evidence: { reason: "Receipt detected", snippets: ["Payment receipt. Total $120.00"] },
    });
    expect(parsed.type).toBe("order");
  });
});
