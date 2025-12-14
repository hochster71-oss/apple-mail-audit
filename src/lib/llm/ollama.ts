import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { llmJsonSchema, type LlmJson } from "@/lib/parsing/schema";

type OllamaGenerateResponse = {
  response: string;
  done: boolean;
};

function strictJsonPrompt(emailText: string) {
  return [
    "You are an information extraction system.",
    "Return ONLY valid JSON. No markdown. No extra keys.",
    "If unknown, use 'unknown' or null exactly as schema allows.",
    "Schema:",
    "{\n" +
      '  "type":"subscription|order|membership|unknown",\n' +
      '  "merchant":"string|unknown",\n' +
      '  "product":"string|unknown",\n' +
      '  "amount":number|null,\n' +
      '  "currency":"string|unknown",\n' +
      '  "transaction_date":"YYYY-MM-DD|null",\n' +
      '  "renewal_date":"YYYY-MM-DD|null",\n' +
      '  "is_recurring":boolean,\n' +
      '  "cancel_url":"string|null",\n' +
      '  "confidence":number,\n' +
      '  "evidence":{\n' +
      '    "reason":"string",\n' +
      '    "snippets":["string","string","string","string"]\n' +
      "  }\n" +
      "}",
    "Email:",
    emailText,
  ].join("\n");
}

async function ollamaGenerate(prompt: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    const json = (await res.json()) as OllamaGenerateResponse;
    return json.response;
  } finally {
    clearTimeout(timeout);
  }
}

function extractFirstJsonObject(text: string) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1).trim();
}

export async function extractWithOllama(emailText: string): Promise<{ ok: true; data: LlmJson } | { ok: false; reason: string }> {
  const maxPromptChars = 9000;
  const prompt = strictJsonPrompt(emailText.length > maxPromptChars ? emailText.slice(0, maxPromptChars) : emailText);

  try {
    const response = await ollamaGenerate(prompt, env.LLM_TIMEOUT_MS);
    const jsonText = extractFirstJsonObject(response) ?? response.trim();
    const parsed = safeParseJson(jsonText);
    if (!parsed) {
      // Retry once with stricter framing
      const retry = await ollamaGenerate(prompt + "\n\nReturn ONLY the JSON object.", env.LLM_TIMEOUT_MS);
      const retryJsonText = extractFirstJsonObject(retry) ?? retry.trim();
      const parsedRetry = safeParseJson(retryJsonText);
      if (!parsedRetry) return { ok: false, reason: "LLM returned non-JSON" };

      const validated = llmJsonSchema.safeParse(parsedRetry);
      if (!validated.success) return { ok: false, reason: "LLM JSON did not match schema" };
      return { ok: true, data: validated.data };
    }

    const validated = llmJsonSchema.safeParse(parsed);
    if (!validated.success) return { ok: false, reason: "LLM JSON did not match schema" };
    return { ok: true, data: validated.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LLM unavailable";
    log.warn({ err: msg }, "ollama_unavailable");
    return { ok: false, reason: "LLM unavailable" };
  }
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
