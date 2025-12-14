import { describe, expect, test } from "vitest";
import { inboundPayloadSchema, normalizeInboundEmail } from "@/lib/email/normalize";
import { heuristicParse } from "@/lib/parsing/heuristics";

describe("normalizeInboundEmail", () => {
  test("parses payload and computes messageIdHash", () => {
    const payload = inboundPayloadSchema.parse({
      messageId: "<x@local>",
      from: "Netflix <info@netflix.com>",
      to: "audit-demo@mail.audit.local",
      subject: "Receipt",
      date: new Date().toISOString(),
      text: "Amount: $15.49",
    });

    const n = normalizeInboundEmail(payload);
    expect(n.localPart).toBe("audit-demo");
    expect(n.messageIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(n.snippet.length).toBeGreaterThan(0);
  });
});

describe("heuristicParse", () => {
  test("detects recurring subscription-ish email", () => {
    const n = normalizeInboundEmail(
      inboundPayloadSchema.parse({
        messageId: "<y@local>",
        from: "Example <billing@example.com>",
        to: "audit-demo@mail.audit.local",
        subject: "Your subscription renews on 2026-01-10",
        date: new Date().toISOString(),
        text: "Thanks. Total: $9.99. Renews on 2026-01-10.",
      })
    );

    const g = heuristicParse(n);
    expect(["subscription", "membership"]).toContain(g.type);
    expect(g.isRecurring).toBe(true);
    expect(g.currency).toBe("USD");
    expect(g.amount).toBeCloseTo(9.99);
  });
});
