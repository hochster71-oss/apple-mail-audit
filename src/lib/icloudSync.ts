import { createHmac } from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./env";
import { prisma } from "./db";
import { log } from "./log";

const logger = log.child({ module: "icloud-sync" });

function toHeaderString(addresses: any): string {
  if (!addresses) return "";
  if (typeof addresses === "string") return addresses;
  const list = Array.isArray(addresses?.value) ? addresses.value : [];
  return list
    .map((a: any) => {
      const name = a?.name ? String(a.name).trim() : "";
      const addr = a?.address ? String(a.address).trim() : "";
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

function makeHeaders(body: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (env.WEBHOOK_SECRET) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const payload = `${ts}.${body}`;
    const sig = createHmac("sha256", env.WEBHOOK_SECRET).update(payload).digest("hex");
    headers["x-webhook-timestamp"] = ts;
    headers["x-webhook-signature"] = sig;
    return headers;
  }

  if (!env.DEV_WEBHOOK_SECRET) {
    throw new Error("Missing DEV_WEBHOOK_SECRET or WEBHOOK_SECRET for inbound call");
  }
  headers["x-dev-webhook-secret"] = env.DEV_WEBHOOK_SECRET;
  return headers;
}

async function postInbound(payload: any) {
  const baseUrl = new URL(env.APP_URL);
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

let syncInFlight = false;

async function resolveMailboxes(client: ImapFlow, rawMailbox: string): Promise<string[]> {
  const raw = (rawMailbox || "INBOX").trim();
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

export async function runIcloudSyncIfEnabled() {
  if (syncInFlight) {
    logger.info("icloud_sync_already_running");
    return;
  }
  if (!env.ICLOUD_EMAIL || !env.ICLOUD_APP_PASSWORD) {
    logger.warn({ hasEmail: !!env.ICLOUD_EMAIL, hasPassword: !!env.ICLOUD_APP_PASSWORD }, "icloud_sync_disabled_missing_creds");
    return;
  }

  const cfg = await prisma.icloudSyncConfig.findFirst({
    where: { enabled: true },
    select: {
      id: true,
      userId: true,
      mailbox: true,
      limit: true,
      sinceDays: true,
    },
  });
  if (!cfg) {
    logger.info("icloud_sync_no_enabled_config");
    return;
  }
  
  logger.info({ userId: cfg.userId, mailbox: cfg.mailbox, limit: cfg.limit, sinceDays: cfg.sinceDays }, "icloud_sync_starting");

  syncInFlight = true;
  const startedAt = new Date();
  let totalOk = 0;
  let totalFailed = 0;
  let totalSelected = 0;
  const errors: string[] = [];

  try {
    const mailboxRaw = cfg.mailbox || env.ICLOUD_MAILBOX;
    const limit = cfg.limit || env.ICLOUD_LIMIT;
    const sinceDays = cfg.sinceDays || env.ICLOUD_SINCE_DAYS;
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const client = new ImapFlow({
      host: "imap.mail.me.com",
      port: 993,
      secure: true,
      auth: { user: env.ICLOUD_EMAIL, pass: env.ICLOUD_APP_PASSWORD },
      logger: false,
    });

    await client.connect();
    try {
      const mailboxes = await resolveMailboxes(client, mailboxRaw);

      for (const mailbox of mailboxes) {
        const lock = await client.getMailboxLock(mailbox);
        let ok = 0;
        let failed = 0;
        try {
          const uids = await client.search({ since });
          const uidList = Array.isArray(uids) ? uids : [];
          if (uidList.length === 0) {
            continue;
          }

          const selected = uidList.slice(Math.max(0, uidList.length - limit));
          totalSelected += selected.length;

          for await (const msg of client.fetch(selected, {
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
              const date = finalDate instanceof Date && !Number.isNaN(finalDate.valueOf()) ? finalDate.toISOString() : undefined;

              const text = safeText(parsed.text || parsed.textAsHtml || "");
              const html = parsed.html ? safeText(String(parsed.html), 500_000) : undefined;

              const payload = {
                messageId,
                from,
                to: env.FORWARD_TO ?? "audit-demo@mail.audit.local",
                subject,
                ...(date ? { date } : {}),
                text: text || "(empty)",
                ...(html ? { html } : {}),
              };

              const res = await postInbound(payload);
              if (res.status >= 200 && res.status < 300) ok++;
              else failed++;
            } catch (err: any) {
              failed++;
              logger.warn({ err: err?.message ?? String(err), uid: msg.uid, mailbox }, "icloud_sync_parse_failed");
            }
          }

          totalOk += ok;
          totalFailed += failed;
        } catch (err: any) {
          errors.push(`mailbox ${mailbox}: ${err?.message ?? String(err)}`);
          logger.warn({ err: err?.message ?? String(err), mailbox }, "icloud_sync_mailbox_failed");
        } finally {
          lock.release();
        }
      }

      const status = totalSelected === 0 ? "no_messages" : `mb:${mailboxes.length} ok:${totalOk}/${totalSelected}` + (totalFailed ? ` failed:${totalFailed}` : "");
      await prisma.icloudSyncConfig.update({
        where: { id: cfg.id },
        data: {
          lastRunAt: startedAt,
          lastStatus: status,
          lastError: errors.length ? errors.join(" | ") : totalFailed ? `failed:${totalFailed}` : null,
        },
      });
    } finally {
      await client.logout().catch(() => undefined);
    }
  } catch (e: any) {
    logger.warn({ err: e?.message ?? String(e) }, "icloud_sync_failed");
    await prisma.icloudSyncConfig.update({
      where: { id: cfg.id },
      data: { lastRunAt: startedAt, lastError: e?.message ?? String(e) },
    });
  } finally {
    syncInFlight = false;
  }
}
