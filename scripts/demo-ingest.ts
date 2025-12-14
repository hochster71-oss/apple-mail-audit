import "dotenv/config";
import { z } from "zod";
import { createHmac } from "crypto";

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEV_WEBHOOK_SECRET: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1).optional(),
  FORWARD_TO: z.string().min(3).optional(),
});

const env = envSchema.parse({
  APP_URL: process.env.APP_URL,
  DEV_WEBHOOK_SECRET: process.env.DEV_WEBHOOK_SECRET,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  FORWARD_TO: process.env.FORWARD_TO,
});

type Email = {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  html?: string;
};

function sampleEmails(to: string): Email[] {
  return [
    {
      messageId: "<demo-1@local>",
      from: "Netflix <info@netflix.com>",
      to,
      subject: "Your Netflix receipt",
      date: new Date().toISOString(),
      text: "Thanks for your payment. Amount: $15.49. Your next billing date is in 30 days.",
    },
    {
      messageId: "<demo-2@local>",
      from: "Apple <donotreply@apple.com>",
      to,
      subject: "Receipt for your purchase",
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      text: "Order ID: W12345. Total: €9,99. Item: iCloud+ 200GB. Renews on 2026-01-10.",
    },
    {
      messageId: "<demo-3@local>",
      from: "Gym Membership <billing@gym.example>",
      to,
      subject: "Monthly membership renewal",
      date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      text: "Your membership has been renewed. Amount 49.00 USD. Cancel here: https://gym.example/cancel",
    },
    {
      messageId: "<demo-4@local>",
      from: "Random Updates <news@random.example>",
      to,
      subject: "Welcome!",
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      text: "Thanks for subscribing to our newsletter. No billing information.",
    },
    {
      messageId: "<demo-5@local>",
      from: "Stripe <receipts@stripe.com>",
      to,
      subject: "Payment receipt",
      date: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
      text: "Payment receipt. Total $120.00. This is a one-time charge.",
    },
  ];
}

async function main() {
  const to = env.FORWARD_TO ?? "audit-demo@mail.audit.local";
  const baseUrl = new URL(env.APP_URL);
  // On some Windows setups, Node's fetch prefers IPv6 (::1) for localhost, which can
  // accidentally hit a different listener on port 3000. Force IPv4 loopback here.
  if (baseUrl.hostname === "localhost") baseUrl.hostname = "127.0.0.1";
  const url = new URL("/api/inbound/email", baseUrl).toString();

  const emails = sampleEmails(to);
  for (const email of emails) {
    const bodyJson = JSON.stringify(email);

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (env.WEBHOOK_SECRET) {
      const ts = Math.floor(Date.now() / 1000).toString();
      const payload = `${ts}.${bodyJson}`;
      const sig = createHmac("sha256", env.WEBHOOK_SECRET).update(payload).digest("hex");
      headers["x-webhook-timestamp"] = ts;
      headers["x-webhook-signature"] = sig;
    } else {
      headers["x-dev-webhook-secret"] = env.DEV_WEBHOOK_SECRET;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: bodyJson,
    });

    const body = await res.text();
    // eslint-disable-next-line no-console
    console.log(res.status, email.subject, body);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
