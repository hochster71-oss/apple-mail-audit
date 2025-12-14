import type { NormalizedEmail } from "@/lib/email/normalize";
import { heuristicParse } from "@/lib/parsing/heuristics";
import { extractWithOllama } from "@/lib/llm/ollama";
import { parsedItemCoreSchema, type ParsedItemCore } from "@/lib/parsing/schema";

const MAX_SNIPPET_LEN = 200;

// Accept only http/https URLs; everything else becomes null to avoid downstream errors.
export function sanitizeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const proto = parsed.protocol.toLowerCase();
    if (proto === "http:" || proto === "https:") return parsed.toString();
  } catch {
    /* ignore invalid URLs */
  }
  return null;
}

function trimSnippets(snippets: string[]): string[] {
  return snippets.slice(0, 4).map((s) => (s.length > MAX_SNIPPET_LEN ? s.slice(0, MAX_SNIPPET_LEN) : s)).filter(Boolean);
}

function dateFromYMD(ymd: string | null): Date | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function parseEmailToItems(email: NormalizedEmail): Promise<ParsedItemCore[]> {
  const h = heuristicParse(email);

  // LLM only if low confidence OR missing key fields
  const needsLlm = h.confidence < 0.7 || h.type === "unknown" || (h.amount === null && h.isRecurring);
  if (!needsLlm) {
    const core: ParsedItemCore = {
      type: h.type,
      merchant: h.merchant,
      product: h.product,
      amount: h.amount,
      currency: h.currency,
      transactionDate: h.transactionDate,
      renewalDate: h.renewalDate,
      isRecurring: h.isRecurring,
      cancelUrl: sanitizeUrl(h.cancelUrl),
      confidence: h.confidence,
      evidenceReason: h.evidenceReason,
      evidenceSnippets: trimSnippets(h.evidenceSnippets),
      llmUsed: false,
      llmUnavailable: false,
    };
    return [parsedItemCoreSchema.parse(core)];
  }

  const llm = await extractWithOllama(email.modelText);
  if (!llm.ok) {
    const core: ParsedItemCore = {
      type: h.type,
      merchant: h.merchant,
      product: h.product,
      amount: h.amount,
      currency: h.currency,
      transactionDate: h.transactionDate,
      renewalDate: h.renewalDate,
      isRecurring: h.isRecurring,
      cancelUrl: sanitizeUrl(h.cancelUrl),
      confidence: Math.min(h.confidence, 0.49),
      evidenceReason: `${h.evidenceReason}. ${llm.reason}.`,
      evidenceSnippets: trimSnippets(h.evidenceSnippets),
      llmUsed: true,
      llmUnavailable: true,
    };
    return [parsedItemCoreSchema.parse(core)];
  }

  const d = llm.data;
  const core: ParsedItemCore = {
    type: d.type,
    merchant: d.merchant,
    product: d.product,
    amount: d.amount,
    currency: d.currency,
    transactionDate: dateFromYMD(d.transaction_date) ?? h.transactionDate,
    renewalDate: dateFromYMD(d.renewal_date) ?? h.renewalDate,
    isRecurring: d.is_recurring,
    cancelUrl: sanitizeUrl(d.cancel_url) ?? sanitizeUrl(h.cancelUrl),
    confidence: d.confidence,
    evidenceReason: d.evidence.reason,
    evidenceSnippets: trimSnippets(d.evidence.snippets),
    llmUsed: true,
    llmUnavailable: false,
  };
  return [parsedItemCoreSchema.parse(core)];
}
