# Parsing decisions

## Pipeline overview

1) Normalize inbound email

- Extract: messageId, from, to, subject, date, plainText
- Sanitize: HTML is stripped to safe text; raw HTML is never rendered.
- Snippet: short excerpt only
- Model input: truncated to a safe maximum size

2) Deterministic heuristics (first)

Heuristics look for:

- receipt markers: `receipt`, `order id`, `payment receipt`, `purchase`
- subscription markers: `renews on`, `next billing date`, `subscription`, `monthly`, `annual`
- membership markers: `membership renewal`
- cancellation markers: `cancel`, `manage subscription`, `unsubscribe`

Extraction attempts:

- Amount/currency regex: `$15.49`, `USD 49.00`, `€9,99`
- Merchant inference: display name in From header or domain fallback
- Renewal date: `YYYY-MM-DD` pattern

3) LLM (Ollama) only if needed

We call Ollama only when:

- heuristic confidence < 0.7, OR
- type is `unknown`, OR
- recurring suspected but key fields missing (e.g., amount)

LLM integration:

- Server-side only
- Calls `POST {OLLAMA_BASE_URL}/api/generate` with `stream:false` and `temperature:0.2`
- Enforces timeout via AbortController
- Strict JSON required; output is validated with Zod
- If invalid, one retry; otherwise the item is marked uncertain
- If Ollama unavailable: item stored with reduced confidence and reason includes `LLM unavailable`

### Strict JSON schema

Compatible JSON fields:

```json
{
  "type": "subscription|order|membership|unknown",
  "merchant": "string|unknown",
  "product": "string|unknown",
  "amount": 0,
  "currency": "string|unknown",
  "transaction_date": "YYYY-MM-DD|null",
  "renewal_date": "YYYY-MM-DD|null",
  "is_recurring": true,
  "cancel_url": "string|null",
  "confidence": 0.5,
  "evidence": {
    "reason": "string",
    "snippets": ["string"]
  }
}
```

4) Evidence-based status scoring

Rules (simplified):

- Active:
  - recent renewal marker within 180 days, OR
  - recurring category with last seen within 60 days
- Inactive:
  - explicit cancellation signal, OR
  - last seen > 12 months
- Likely:
  - recurring category but limited recency signals
- Uncertain:
  - type unknown

Every item stores:

- inboundEmailId (traceability)
- evidence snippets (2–4)
- status rationale

## Known limitations

- MVP creates a single parsed item per email (even if the email contains multiple items).
- Currency totals are displayed by currency and are estimates (no FX conversion).
