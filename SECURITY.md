# Security

This project treats inbound email content as untrusted hostile input.

## Threat model (high level)

- Malicious HTML/JS in email bodies
- Oversized payloads (DoS)
- Webhook forgery / replay
- Data exfiltration (raw email storage)
- Credential stuffing against login

## Mitigations implemented

- Inbound payload size limit: `INBOUND_MAX_BYTES`.
- Input validation: Zod schema on inbound JSON.
- Sanitization: HTML-to-text stripping; raw HTML is never rendered.
- Deduplication: unique constraint on `(userId, messageIdHash)`.
- Rate limiting: DB-backed buckets for inbound and login attempts.
- Secrets via env only (`.env.example`).
- Transactional DB writes for ingestion + parsing.

## Webhook verification

- Development: requires `x-dev-webhook-secret` header matching `DEV_WEBHOOK_SECRET`.
- Production: expects `x-webhook-timestamp` and `x-webhook-signature`.

Signature scheme:

```
signature = hex(hmac_sha256(WEBHOOK_SECRET, `${timestamp}.${rawBody}`))
```

## Operational guidance

- Set strong `NEXTAUTH_SECRET`.
- Keep `DEV_WEBHOOK_SECRET` unset in production.
- Consider running behind a reverse proxy that enforces additional request size limits.
