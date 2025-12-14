import "dotenv/config";

import { createHmac } from "crypto";
import { promises as fs } from "fs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEV_WEBHOOK_SECRET: z.string().min(1).optional(),
  WEBHOOK_SECRET: z.string().min(1).optional(),
  FORWARD_TO: z.string().min(3).default("audit-demo@mail.audit.local"),

  ICLOUD_EMAIL: z.string().email(),
  // This is NOT your Apple ID password. Generate an app-specific password.
  ICLOUD_APP_PASSWORD: z.string().min(8),
  ICLOUD_MAILBOX: z.string().min(1).default("ALL"),
  ICLOUD_LIMIT: z.coerce.number().int().positive().max(5000).default(250),
  ICLOUD_SINCE_DAYS: z.coerce.number().int().positive().max(3650).default(365),
  ICLOUD_THROTTLE_MS: z.coerce.number().int().min(0).max(60_000).default(300),
  ICLOUD_RESUME: z.coerce.boolean().default(true),
  ICLOUD_STATE_PATH: z.string().default("tmp/icloud-state.json"),
  ICLOUD_MAX_TEXT_BYTES: z.coerce.number().int().min(10_000).max(1_000_000).default(200_000),
  ICLOUD_MAX_HTML_BYTES: z.coerce.number().int().min(50_000).max(2_000_000).default(500_000),
  ICLOUD_DRY_RUN: z.coerce.boolean().default(false),
  ICLOUD_INCLUDE_ATTACHMENTS: z.coerce.boolean().default(true),
  ICLOUD_FILTER_FROM: z.string().optional(),
  ICLOUD_FILTER_SUBJECT: z.string().optional(),
  ICLOUD_CONCURRENT: z.coerce.number().int().min(1).max(10).default(1),
  ICLOUD_TRACK_MAILBOX: z.coerce.boolean().default(true),
});

const env = envSchema.parse({
  APP_URL: process.env.APP_URL,
  DEV_WEBHOOK_SECRET: process.env.DEV_WEBHOOK_SECRET,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  FORWARD_TO: process.env.FORWARD_TO,

  ICLOUD_EMAIL: process.env.ICLOUD_EMAIL,
  ICLOUD_APP_PASSWORD: process.env.ICLOUD_APP_PASSWORD,
  ICLOUD_MAILBOX: process.env.ICLOUD_MAILBOX,
  ICLOUD_LIMIT: process.env.ICLOUD_LIMIT,
  ICLOUD_SINCE_DAYS: process.env.ICLOUD_SINCE_DAYS,
  ICLOUD_THROTTLE_MS: process.env.ICLOUD_THROTTLE_MS,
  ICLOUD_RESUME: process.env.ICLOUD_RESUME,
  ICLOUD_STATE_PATH: process.env.ICLOUD_STATE_PATH,
  ICLOUD_MAX_TEXT_BYTES: process.env.ICLOUD_MAX_TEXT_BYTES,
  ICLOUD_MAX_HTML_BYTES: process.env.ICLOUD_MAX_HTML_BYTES,
  ICLOUD_DRY_RUN: process.env.ICLOUD_DRY_RUN,
  ICLOUD_INCLUDE_ATTACHMENTS: process.env.ICLOUD_INCLUDE_ATTACHMENTS,
  ICLOUD_FILTER_FROM: process.env.ICLOUD_FILTER_FROM,
  ICLOUD_FILTER_SUBJECT: process.env.ICLOUD_FILTER_SUBJECT,
  ICLOUD_CONCURRENT: process.env.ICLOUD_CONCURRENT,
  ICLOUD_TRACK_MAILBOX: process.env.ICLOUD_TRACK_MAILBOX,
});

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function resolveMailboxes(client: ImapFlow): Promise<string[]> {
  const raw = (env.ICLOUD_MAILBOX || "INBOX").trim();
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const wantsAll = parts.some((p) => p.toUpperCase() === "ALL");
  if (wantsAll) {
    const boxes = await client.list();
    const names = boxes.map((b) => b.path).filter(Boolean);
    if (names.length === 0) throw new Error("No mailboxes found via LIST");
    return names;
  }

  return parts.length > 0 ? parts : ["INBOX"];
}

function usageAndExit() {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  pnpm import:icloud",
      "",
      "Env required:",
      "  ICLOUD_EMAIL=yourname@icloud.com",
      "  ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx (app-specific password)",
      "",
      "Optional:",
      "  ICLOUD_MAILBOX=INBOX (or 'ALL' for all mailboxes)",
      "  ICLOUD_LIMIT=250",
      "  ICLOUD_SINCE_DAYS=365",
      "  ICLOUD_DRY_RUN=false (set true to preview without importing)",
      "  ICLOUD_INCLUDE_ATTACHMENTS=true",
      "  ICLOUD_FILTER_FROM=pattern (regex to filter by sender)",
      "  ICLOUD_FILTER_SUBJECT=pattern (regex to filter by subject)",
      "  ICLOUD_CONCURRENT=1 (parallel processing, 1-10)",
      "  ICLOUD_TRACK_MAILBOX=true (include source mailbox in payload)",
      "",
      "Notes:",
      "- This does NOT use the iCloud.com web login flow.",
      "- Apple does not provide a supported OAuth to read iCloud Mail.",
      "- App-specific password is created at appleid.apple.com (requires 2FA).",
    ].join("\n")
  );
  process.exit(2);
}

function toHeaderString(addresses: any): string {
  if (!addresses) return "";
  if (typeof addresses === "string") return addresses;
  const list = Array.isArray(addresses.value) ? addresses.value : [];
  return list
    .map((a: any) => {
      const name = a.name ? String(a.name).trim() : "";
      const addr = a.address ? String(a.address).trim() : "";
      if (name && addr) return `${name} <${addr}>`;
      return addr || name;
    })
    .filter(Boolean)
    .join(", ");
}

function safeText(input: unknown, max = 200_000) {
  const s = typeof input === "string" ? input : "";
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function matchesFilters(from: string, subject: string): boolean {
  if (env.ICLOUD_FILTER_FROM) {
    const pattern = new RegExp(env.ICLOUD_FILTER_FROM, "i");
    if (!pattern.test(from)) return false;
  }
  if (env.ICLOUD_FILTER_SUBJECT) {
    const pattern = new RegExp(env.ICLOUD_FILTER_SUBJECT, "i");
    if (!pattern.test(subject)) return false;
  }
  return true;
}

function makeHeaders(body: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  // Prefer prod-style signature if WEBHOOK_SECRET is configured.
  if (env.WEBHOOK_SECRET) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const payload = `${ts}.${body}`;
    const sig = createHmac("sha256", env.WEBHOOK_SECRET).update(payload).digest("hex");
    headers["x-webhook-timestamp"] = ts;
    headers["x-webhook-signature"] = sig;
    return headers;
  }

  if (!env.DEV_WEBHOOK_SECRET) {
    throw new Error("Missing DEV_WEBHOOK_SECRET or WEBHOOK_SECRET in environment");
  }
  headers["x-dev-webhook-secret"] = env.DEV_WEBHOOK_SECRET;
  return headers;
}

type MailboxState = Record<string, number>;

async function loadState(path: string): Promise<MailboxState> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as MailboxState;
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
  return {};
}

async function saveState(path: string, state: MailboxState) {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  await fs.writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

async function postInbound(payload: any) {
  const baseUrl = new URL(env.APP_URL);
  // Same Windows localhost/IPv6 quirk protection as demo-ingest.
  if (baseUrl.hostname === "localhost") baseUrl.hostname = "127.0.0.1";
  const url = new URL("/api/inbound/email", baseUrl).toString();

  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: makeHeaders(body),
    body,
  });

  const resText = await res.text();
  return { status: res.status, body: resText };
}

async function postWithFallback(payload: any) {
  if (env.ICLOUD_DRY_RUN) {
    return { res: { status: 200, body: '{"status":"dry-run"}' }, slimmed: false };
  }

  const first = await postInbound(payload);
  if (first.status !== 413) return { res: first, slimmed: false };

  const slim: any = { ...payload, html: undefined };
  slim.text = safeText(payload.text, env.ICLOUD_MAX_TEXT_BYTES);
  const retry = await postInbound(slim);
  return { res: retry, slimmed: true };
}

async function processInChunks<T>(items: T[], chunkSize: number, processor: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(processor));
  }
}

async function main() {
  if (!env.ICLOUD_EMAIL || !env.ICLOUD_APP_PASSWORD) usageAndExit();

  const since = new Date(Date.now() - env.ICLOUD_SINCE_DAYS * 24 * 60 * 60 * 1000);

  const client = new ImapFlow({
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    auth: {
      user: env.ICLOUD_EMAIL,
      pass: env.ICLOUD_APP_PASSWORD,
    },
    logger: false,
  });

  await client.connect();

  const mailboxes = await resolveMailboxes(client);
  const state = env.ICLOUD_RESUME ? await loadState(env.ICLOUD_STATE_PATH) : {};

  // eslint-disable-next-line no-console
  console.log(
    `Connected. Mailboxes=${mailboxes.join(",")} Since=${since.toISOString()} LimitPerMailbox=${env.ICLOUD_LIMIT}`
  );
  if (env.ICLOUD_DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log("⚠️  DRY RUN MODE - No messages will be posted");
  }
  if (env.ICLOUD_FILTER_FROM || env.ICLOUD_FILTER_SUBJECT) {
    // eslint-disable-next-line no-console
    console.log(
      `Filters: ${env.ICLOUD_FILTER_FROM ? `from=${env.ICLOUD_FILTER_FROM} ` : ""}${env.ICLOUD_FILTER_SUBJECT ? `subject=${env.ICLOUD_FILTER_SUBJECT}` : ""}`
    );
  }

  let totalOk = 0;
  let totalFailed = 0;
  let totalAttempted = 0;
  let totalSkipped = 0;
  let totalDeduped = 0;

  let throttleMs = env.ICLOUD_THROTTLE_MS;
  let successStreak = 0;
  let errorStreak = 0;

  for (const mailbox of mailboxes) {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uids = await client.search({ since });
      if (!uids || uids.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`Mailbox ${mailbox}: no messages found for that date range.`);
        continue;
      }

      const selected = [...uids]
        .sort((a, b) => a - b)
        .filter((uid) => !env.ICLOUD_RESUME || uid > (state[mailbox] ?? 0));
      const batches = chunkArray(selected, env.ICLOUD_LIMIT);

      let ok = 0;
      let failed = 0;
      let attempted = 0;
      let skipped = 0;
      let deduped = 0;

      // eslint-disable-next-line no-console
      console.log(`Mailbox ${mailbox}: ${selected.length} messages in ${batches.length} batches`);

      for (const batch of batches) {
        for await (const msg of client.fetch(batch, {
          uid: true,
          source: true,
          internalDate: true,
        })) {
          try {
            const parsed = await simpleParser(msg.source as any);

            const messageId = parsed.messageId || `<imap-${msg.uid}@local>`;
            const from = toHeaderString(parsed.from) || "unknown";
            const subject = parsed.subject || "(no subject)";
            const parsedDate = typeof parsed.date === "string" ? new Date(parsed.date) : parsed.date;
            const finalDate = parsedDate ?? msg.internalDate;
            const date =
              finalDate instanceof Date && !Number.isNaN(finalDate.valueOf()) ? finalDate.toISOString() : undefined;

            // Filter check
            if (!matchesFilters(from, subject)) {
              skipped++;
              continue;
            }

            const text = safeText(parsed.text || parsed.textAsHtml || "", env.ICLOUD_MAX_TEXT_BYTES);
            const html = parsed.html ? safeText(String(parsed.html), env.ICLOUD_MAX_HTML_BYTES) : undefined;

            // Handle attachments
            const attachments: any[] = [];
            if (env.ICLOUD_INCLUDE_ATTACHMENTS && parsed.attachments?.length) {
              for (const att of parsed.attachments) {
                attachments.push({
                  filename: att.filename || "unnamed",
                  contentType: att.contentType || "application/octet-stream",
                  size: att.size || 0,
                  // Include checksum for audit trail
                  checksum: att.checksum,
                  contentId: att.contentId,
                });
              }
            }

            const payload: any = {
              messageId,
              from,
              // Force association with the demo forwarding address/user.
              to: env.FORWARD_TO,
              subject,
              ...(date ? { date } : {}),
              text: text || "(empty)",
              ...(html ? { html } : {}),
              ...(attachments.length > 0 ? { attachments } : {}),
              ...(env.ICLOUD_TRACK_MAILBOX ? { sourceMailbox: mailbox } : {}),
            };

            attempted++;
            const { res, slimmed } = await postWithFallback(payload);
            let dedupedFlag = false;
            try {
              const parsedBody = JSON.parse(res.body);
              dedupedFlag = !!parsedBody?.deduped;
            } catch {
              /* ignore */
            }

            if (res.status >= 200 && res.status < 300) {
              ok++;
              if (dedupedFlag) deduped++;
              state[mailbox] = msg.uid;
              successStreak++;
              errorStreak = 0;
            } else if (res.status === 413) {
              skipped++;
              errorStreak++;
            } else {
              failed++;
              errorStreak++;
            }

            // eslint-disable-next-line no-console
            console.log(
              `${res.status} uid=${msg.uid} ${subject} ${slimmed ? "(slimmed) " : ""}${res.body}`
            );

            // Adaptive throttling: back off on errors, ramp down on streaks.
            if (errorStreak > 0) {
              throttleMs = Math.min(2000, Math.floor(throttleMs * 1.5) + 50);
              successStreak = 0;
            } else if (successStreak >= 20) {
              throttleMs = Math.max(50, Math.floor(throttleMs * 0.8));
              successStreak = 0;
            }

            if (throttleMs > 0) {
              await new Promise((r) => setTimeout(r, throttleMs));
            }
          } catch (e: any) {
            failed++;
            // eslint-disable-next-line no-console
            console.log(`ERROR uid=${msg.uid} ${e?.message ?? String(e)}`);
            errorStreak++;
          }
        }
      }

      totalOk += ok;
      totalFailed += failed;
      totalAttempted += attempted;
      totalSkipped += skipped;
      totalDeduped += deduped;
      // eslint-disable-next-line no-console
      console.log(
        `Mailbox ${mailbox}: { discovered: ${selected.length}, attempted: ${attempted}, ok: ${ok}, failed: ${failed}, skipped413: ${skipped}, deduped: ${deduped} }`
      );

      if (env.ICLOUD_RESUME) {
        await saveState(env.ICLOUD_STATE_PATH, state);
      }
    } finally {
      lock.release();
    }
  }

  await client.logout().catch(() => undefined);

  // eslint-disable-next-line no-console
  console.log({
    ok: totalOk,
    failed: totalFailed,
    attempted: totalAttempted,
    skipped413: totalSkipped,
    skippedFilters: totalSkipped - (totalAttempted > 0 ? 0 : totalSkipped),
    deduped: totalDeduped,
    throttleMs,
    dryRun: env.ICLOUD_DRY_RUN,
  });
  if (totalFailed > 0 && !env.ICLOUD_DRY_RUN) process.exit(1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
