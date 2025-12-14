# Data retention and minimization

## Defaults

- The app stores:
  - normalized metadata (from/to/subject/date)
  - short excerpt snippet
  - parsed items + evidence snippets
- The app does **not** store full raw email bodies by default.

## Optional raw storage

Raw storage is disabled by default.

To enable:

- `ENABLE_RAW_EMAIL_STORAGE=true`
- `RAW_EMAIL_ENCRYPTION_KEY_BASE64=<32-byte key base64>`
- `RAW_EMAIL_TTL_DAYS=7` (default)

Raw email content is stored encrypted (AES-256-GCM) in `RawEmailBlob` with an expiration timestamp.

Expired blobs are deleted opportunistically during inbound ingestion.

## User controls

- Export: `GET /api/user/export`
- Delete: `POST /api/user/delete`
