import "dotenv/config";

import { createHmac } from "crypto";
import fs from "fs";
import path from "path";
import { simpleParser } from "mailparser";
import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEV_WEBHOOK_SECRET: z.string().min(1).optional(),
  WEBHOOK_SECRET: z.string().min(1).optional(),
  FORWARD_TO: z.string().min(3).default("audit-demo@mail.audit.local"),
});

const env = envSchema.parse({
  APP_URL: process.env.APP_URL,
  DEV_WEBHOOK_SECRET: process.env.DEV_WEBHOOK_SECRET,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  FORWARD_TO: process.env.FORWARD_TO,
});

function usageAndExit() {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  pnpm import:mail <path-to-.eml-or-.emlx-or-folder>",
      "",
      "Notes:",
      "- This does NOT log into iCloud. It imports exported message files.",
      "- Put DEV_WEBHOOK_SECRET (or WEBHOOK_SECRET) in .env.",
      "- Defaults to forwarding address: audit-demo@mail.audit.local",
    ].join("\n")
  );
  process.exit(2);
}

function isProbablyEmlx(buf: Buffer) {
  // Apple Mail .emlx usually starts with a decimal length line, then RFC822.
  const firstLineEnd = buf.indexOf(0x0a); // \n
  if (firstLineEnd <= 0 || firstLineEnd > 32) return false;
  const firstLine = buf.slice(0, firstLineEnd).toString("utf8").trim();
  return /^[0-9]+$/.test(firstLine);
}

function normalizeRawEmailFile(buf: Buffer): Buffer {
  if (!isProbablyEmlx(buf)) return buf;
  const firstLineEnd = buf.indexOf(0x0a);
  return buf.slice(firstLineEnd + 1);
}

async function listFiles(inputPath: string): Promise<string[]> {
  const st = await fs.promises.stat(inputPath);
  if (st.isFile()) return [inputPath];

  if (!st.isDirectory()) return [];

  const out: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(p);
    }
  };

  await walk(inputPath);
  return out;
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

async function ingestOne(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".eml" && ext !== ".emlx") return { skipped: true as const, reason: "unsupported_ext" };

  const raw = await fs.promises.readFile(filePath);
  const normalized = normalizeRawEmailFile(raw);

  const parsed = await simpleParser(normalized);

  const messageId = parsed.messageId || `<import-${path.basename(filePath)}@local>`;
  const from = toHeaderString(parsed.from) || "unknown";
  const to = toHeaderString(parsed.to) || env.FORWARD_TO;
  const subject = parsed.subject || "(no subject)";
  const date = parsed.date ? parsed.date.toISOString() : undefined;

  const text = safeText(parsed.text || parsed.textAsHtml || "");
  const html = parsed.html ? safeText(String(parsed.html), 500_000) : undefined;

  const payload = {
    messageId,
    from,
    to,
    subject,
    date,
    text: text || "(empty)",
    ...(html ? { html } : {}),
  };

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
  return { skipped: false as const, status: res.status, body: resText };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) usageAndExit();

  const files = await listFiles(inputPath);
  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No files found.");
    process.exit(1);
  }

  const candidates = files.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ext === ".eml" || ext === ".emlx";
  });

  // eslint-disable-next-line no-console
  console.log(`Found ${candidates.length} candidate message files.`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const f of candidates) {
    try {
      const r = await ingestOne(f);
      if (r.skipped) {
        skipped++;
        continue;
      }
      if (r.status >= 200 && r.status < 300) ok++;
      else failed++;

      // eslint-disable-next-line no-console
      console.log(`${r.status} ${path.basename(f)} ${r.body}`);
    } catch (e: any) {
      failed++;
      // eslint-disable-next-line no-console
      console.log(`ERROR ${path.basename(f)} ${e?.message ?? String(e)}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log({ ok, failed, skipped });
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
