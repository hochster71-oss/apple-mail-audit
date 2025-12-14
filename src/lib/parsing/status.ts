import { ParsedItemCore } from "@/lib/parsing/schema";

export type ParsedStatus = "active" | "likely" | "inactive" | "uncertain";

export function computeStatus(input: {
  core: ParsedItemCore;
  lastSeenAt: Date;
}): { status: ParsedStatus; reason: string } {
  const { core, lastSeenAt } = input;
  const now = new Date();
  const ageDays = Math.floor((now.getTime() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24));

  const lowerReason = core.evidenceReason.toLowerCase();
  if (/(cancelled|canceled|cancellation|subscription cancelled)/i.test(lowerReason)) {
    return { status: "inactive", reason: "Explicit cancellation signal" };
  }

  if (core.type === "unknown") {
    return { status: "uncertain", reason: "Unclassified" };
  }

  const hasRenewalHint = core.renewalDate !== null || /(renews|next billing|will renew)/i.test(core.evidenceReason);

  // Active rules
  if (hasRenewalHint && ageDays <= 180) return { status: "active", reason: "Recent renewal/billing marker" };
  if (ageDays <= 60 && (core.type === "subscription" || core.type === "membership")) {
    return { status: "active", reason: "Recent receipt for recurring category" };
  }

  // Inactive
  if (ageDays > 365) return { status: "inactive", reason: "No activity in over 12 months" };

  // Likely
  if (core.type === "subscription" || core.type === "membership") {
    return { status: "likely", reason: "Recurring category but limited recency signals" };
  }

  return { status: "likely", reason: "Has transaction evidence but limited metadata" };
}
