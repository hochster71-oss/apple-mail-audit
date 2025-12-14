# Mail Audit (MVP)

Local-first app that ingests forwarded emails, extracts subscriptions/orders/memberships with evidence + confidence, and shows an audit dashboard.

## Requirements

- Docker Desktop (for Postgres)
- Node.js 20+
- pnpm 9+
- (Optional) Ollama running locally at `http://127.0.0.1:11434`

## Quick start

1) Start Postgres

```bash
docker compose up -d
```

2) Install deps

```bash
pnpm i
```

3) Configure env

```bash
copy .env.example .env
```

Set at least:

- `NEXTAUTH_SECRET` (long random string)
- `WEBHOOK_SECRET` (any random string)
- `DEV_WEBHOOK_SECRET` (required to run demo ingestion)

4) Migrate + seed

```bash
pnpm db:migrate
pnpm db:seed
```

5) Run the app

```bash
pnpm dev
```

Open: `http://localhost:3000`

Login (seeded):

- Email: `demo@example.com`
- Password: `demo12345`

## Demo ingestion

In a second terminal:

```bash
pnpm demo:ingest
```

This posts 5 sample inbound emails to:

- `POST /api/inbound/email`

The script uses `DEV_WEBHOOK_SECRET` from `.env` and defaults `to=audit-demo@mail.audit.local`.

## Tests

Unit tests:

```bash
pnpm test
```

E2E smoke (requires app running):

```bash
pnpm test:e2e
```

## Key endpoints

- `POST /api/inbound/email` (dev: `x-dev-webhook-secret`)
- `GET /api/user/export` (auth required)
- `POST /api/user/delete` (auth required)

## iCloud Mail (IMAP) import

- One-off import from exported files: `pnpm import:mail <path-to-.eml/.emlx-or-folder>`
- Direct IMAP (app-specific password required): set `ICLOUD_EMAIL` and `ICLOUD_APP_PASSWORD` in `.env`, then:
	- Turn on/off in the dashboard card (auto-runs every `ICLOUD_SYNC_INTERVAL_MINUTES`, default 30), or
	- Run once via `pnpm import:icloud`

## Notes

- By default the app stores only derived metadata and short snippets (no raw email bodies).
- Ollama is used server-side only and only when heuristics are low confidence.
