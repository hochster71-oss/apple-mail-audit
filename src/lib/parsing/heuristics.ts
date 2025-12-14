import { NormalizedEmail } from "@/lib/email/normalize";

type Guess = {
  type: "subscription" | "order" | "membership" | "unknown";
  merchant: string;
  product: string;
  amount: number | null;
  currency: string;
  transactionDate: Date | null;
  renewalDate: Date | null;
  isRecurring: boolean;
  cancelUrl: string | null;
  confidence: number;
  evidenceReason: string;
  evidenceSnippets: string[];
};

function pickSnippets(text: string, patterns: RegExp[], max = 3) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 8 && l.length <= 240);

  const hits: string[] = [];
  for (const line of lines) {
    if (patterns.some((p) => p.test(line))) {
      hits.push(line);
      if (hits.length >= max) break;
    }
  }
  return hits;
}

function parseDateYYYYMMDD(input: string) {
  const m = input.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseAmountAndCurrency(text: string): { amount: number | null; currency: string } {
  // Supports: $15.49, USD 49.00, €9,99
  const patterns: Array<{ re: RegExp; currency: string | ((m: RegExpMatchArray) => string); amountIndex: number }> = [
    { re: /\b(USD|EUR|GBP)\s*([0-9]{1,7}(?:[.,][0-9]{2})?)\b/i, currency: (m) => m[1]!.toUpperCase(), amountIndex: 2 },
    { re: /([$€£])\s*([0-9]{1,7}(?:[.,][0-9]{2})?)\b/, currency: (m) => ({ "$": "USD", "€": "EUR", "£": "GBP" } as const)[m[1] as "$" | "€" | "£"], amountIndex: 2 },
    { re: /\b([0-9]{1,7}(?:[.,][0-9]{2})?)\s*(USD|EUR|GBP)\b/i, currency: (m) => m[2]!.toUpperCase(), amountIndex: 1 },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (!m) continue;
    const raw = m[p.amountIndex]!.replace(",", ".");
    const amount = Number.parseFloat(raw);
    if (!Number.isFinite(amount)) continue;
    const currency = typeof p.currency === "function" ? p.currency(m) : p.currency;
    return { amount, currency };
  }
  return { amount: null, currency: "unknown" };
}

function inferMerchant(from: string) {
  // Try to grab "Name <email@...>" or domain
  const name = from.match(/^\s*"?([^<"]{2,60})"?\s*</)?.[1]?.trim();
  if (name) return name;
  const domain = from.match(/@([A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1]?.toLowerCase();
  if (!domain) return "unknown";
  const base = domain.split(".")[0] ?? domain;
  return base.length > 1 ? base : "unknown";
}

export function heuristicParse(email: NormalizedEmail): Guess {
  const text = `${email.subject}\n\n${email.plainText}`;
  const lower = text.toLowerCase();

  const { amount, currency } = parseAmountAndCurrency(text);
  const merchant = inferMerchant(email.from);

  const hasReceipt = /(receipt|order\s+id|payment\s+receipt|thanks\s+for\s+your\s+purchase)/i.test(text);
  const hasRenew = /(renews?\s+on|next\s+billing\s+date|subscription|monthly|annual|membership\s+renewal|will\s+renew)/i.test(text);
  const hasCancel = /(cancel\s+here|manage\s+subscription|unsubscribe|cancellation|cancel\s+subscription)/i.test(text);

  const cancelUrl = text.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;

  const renewalDate = parseDateYYYYMMDD(text) ?? null;
  const transactionDate = email.date;

  let type: Guess["type"] = "unknown";
  if (hasRenew && /membership/i.test(text)) type = "membership";
  else if (hasRenew) type = "subscription";
  else if (hasReceipt) type = "order";

  const isRecurring = type === "subscription" || type === "membership" || hasRenew;

  // Confidence heuristic
  let confidence = 0.35;
  if (type !== "unknown") confidence += 0.25;
  if (amount !== null && currency !== "unknown") confidence += 0.2;
  if (renewalDate) confidence += 0.1;
  if (hasCancel && cancelUrl) confidence += 0.05;
  if (/newsletter|welcome/i.test(email.subject) && amount === null) confidence = Math.min(confidence, 0.35);
  confidence = Math.max(0, Math.min(0.95, confidence));

  const evidenceSnippets = pickSnippets(email.plainText, [
    /(amount|total|usd|eur|gbp|\$|€|£)/i,
    /(renews|billing|subscription|membership)/i,
    /(order\s+id|receipt|payment)/i,
    /(cancel|manage)/i,
  ]);

  const evidenceReason =
    type === "unknown"
      ? "Heuristics could not confidently classify this email"
      : "Heuristics matched common receipt/subscription patterns";

  return {
    type,
    merchant,
    product: "unknown",
    amount,
    currency,
    transactionDate,
    renewalDate,
    isRecurring,
    cancelUrl,
    confidence,
    evidenceReason,
    evidenceSnippets: evidenceSnippets.length ? evidenceSnippets : [email.snippet].slice(0, 1),
  };
}
