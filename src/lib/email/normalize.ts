import { z } from "zod";
import { sha256Hex } from "@/lib/crypto/hash";
import { htmlToSafeText } from "@/lib/email/sanitize";

export const inboundPayloadSchema = z.object({
  messageId: z.string().min(1).max(500),
  from: z.string().min(1).max(500),
  to: z.string().min(3).max(500),
  subject: z.string().min(1).max(500),
  date: z.string().datetime().optional(),
  text: z.string().min(1).max(200_000),
  html: z.string().max(500_000).optional(),
});

export type InboundPayload = z.infer<typeof inboundPayloadSchema>;

function extractEmailLocalPart(to: string) {
  const m = to.match(/([A-Z0-9._%+-]+)@/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export type NormalizedEmail = {
  localPart: string;
  messageIdHash: string;
  from: string;
  to: string;
  subject: string;
  date: Date | null;
  plainText: string;
  snippet: string;
  modelText: string;
};

function snippetOf(text: string, max = 280) {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function normalizeInboundEmail(payload: InboundPayload): NormalizedEmail {
  const localPart = extractEmailLocalPart(payload.to);
  if (!localPart) {
    throw new Error("Unable to determine forwarding localPart from 'to'");
  }

  const date = payload.date ? new Date(payload.date) : null;
  const htmlText = payload.html ? htmlToSafeText(payload.html) : "";

  // Prefer explicit text; use sanitized HTML as fallback
  const plainText = (payload.text?.trim() || htmlText).trim();
  const combined = [
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    "",
    plainText,
  ].join("\n");

  // Dedup key: messageId only (stable across forwards)
  const messageIdHash = sha256Hex(payload.messageId.trim().toLowerCase());

  // Model input: cap hard (keep enough for receipts)
  const maxModelChars = 8000;
  const modelText = combined.length > maxModelChars ? combined.slice(0, maxModelChars) : combined;

  return {
    localPart,
    messageIdHash,
    from: payload.from.trim(),
    to: payload.to.trim(),
    subject: payload.subject.trim(),
    date: date && Number.isFinite(date.getTime()) ? date : null,
    plainText,
    snippet: snippetOf(plainText, 320),
    modelText,
  };
}
