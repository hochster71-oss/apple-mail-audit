import { env } from "@/lib/env";
import { log } from "@/lib/log";
import type { NormalizedEmail } from "@/lib/email/normalize";
import { z } from "zod";

const analysisSchema = z.object({
  summary: z.string().min(8).max(600),
  categories: z.array(z.string().min(2).max(64)).max(8),
  risks: z.array(z.string().min(2).max(64)).max(8),
});

const CATEGORY_TAXONOMY = [
  "purchase",
  "receipt",
  "order",
  "account",
  "subscription",
  "membership",
  "newsletter",
  "travel",
  "support",
  "personal",
  "notification",
  "marketing",
  "security",
  "finance",
  "billing",
  "calendar",
  "other",
];

const RISK_TAXONOMY = [
  "phishing",
  "scam",
  "malware",
  "spam",
  "marketing",
  "transactional",
  "account-change",
  "password-reset",
  "billing",
  "invoice",
  "payment",
  "refund",
  "financial",
  "legal",
  "personal",
  "tracking",
  "unknown",
];

function normalizeTag(tag: string) {
  const slug = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  return slug;
}

function dedupeAndLimit(tags: string[], limit: number, fallback: string) {
  const seen = new Set<string>();
  for (const t of tags) {
    const n = normalizeTag(t);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    if (seen.size >= limit) break;
  }
  if (seen.size === 0) seen.add(fallback);
  return Array.from(seen);
}

function extractFirstJsonObject(text: string) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1).trim();
}

function buildPrompt(email: NormalizedEmail) {
  return [
    "You are an assistant that summarizes inbound emails and labels them with categories and risk/intent tags.",
    "Return ONLY valid JSON with this exact shape:",
    '{"summary":"short 1-2 sentences","categories":["token"],"risks":["token"]}',
    "- summary: capture the key purpose and outcome of the email in 1-2 sentences.",
    "- categories: lowercase hyphenated tokens, pick the most relevant 1-3 from this set: " + CATEGORY_TAXONOMY.join(", ") + ".",
    "- risks: lowercase hyphenated intent/risk tags (0-5) from this set: " + RISK_TAXONOMY.join(", ") + ".",
    "Do not include markdown, explanations, or extra keys.",
    "Email context:",
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    email.date ? `Date: ${email.date.toISOString()}` : "Date: unknown",
    "---",
    email.plainText,
  ].join("\n");
}

async function callOllama(prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama error ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { response: string };
    return json.response;
  } finally {
    clearTimeout(timeout);
  }
}

export type EmailAnalysisResult =
  | { ok: true; data: { summary: string; categories: string[]; risks: string[]; model: string } }
  | { ok: false; reason: string };

export async function analyzeEmailWithLlm(email: NormalizedEmail): Promise<EmailAnalysisResult> {
  const prompt = buildPrompt(email);
  try {
    const raw = await callOllama(prompt);
    const jsonText = extractFirstJsonObject(raw) ?? raw.trim();
    const parsed = safeParseJson(jsonText);
    if (!parsed) return { ok: false, reason: "LLM returned non-JSON" };

    const validated = analysisSchema.safeParse(parsed);
    if (!validated.success) return { ok: false, reason: "LLM JSON did not match schema" };

    const categories = dedupeAndLimit(validated.data.categories, 5, "other");
    const risks = dedupeAndLimit(validated.data.risks, 5, "unknown");

    return {
      ok: true,
      data: {
        summary: validated.data.summary.trim().slice(0, 600),
        categories,
        risks,
        model: env.OLLAMA_MODEL,
      },
    };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "LLM unavailable";
    log.warn({ err: msg }, "email_analysis_failed");
    return { ok: false, reason: msg };
  }
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
