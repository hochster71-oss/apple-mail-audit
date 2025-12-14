import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function dbReady() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe("POST /api/inbound/email", async () => {
  const ready = await dbReady();
  const maybe = ready ? test : test.skip;

  beforeAll(async () => {
    if (!ready) return;
    await prisma.rateLimitBucket.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  maybe("accepts dev secret and dedups by messageId", async () => {
    const { POST } = await import("@/app/api/inbound/email/route");

    const email = "apitest@example.com";
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: "not-used-in-this-test" },
      select: { id: true },
    });

    const localPart = `audit-test-${Date.now()}`;
    await prisma.forwardingAddress.create({
      data: { userId: user.id, localPart, isActive: true },
    });

    const body = {
      messageId: `<api-dedup-${Date.now()}@local>`,
      from: "Test <billing@test.local>",
      to: `${localPart}@mail.audit.local`,
      subject: "Receipt",
      date: new Date().toISOString(),
      text: "Payment receipt. Total $10.00",
    };

    const req1 = new Request("http://localhost/api/inbound/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dev-webhook-secret": process.env.DEV_WEBHOOK_SECRET!,
      },
      body: JSON.stringify(body),
    });

    const res1 = await POST(req1);
    if (res1.status !== 200) {
      // eslint-disable-next-line no-console
      console.log("Unexpected status", res1.status, await res1.text());
    }
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.ok).toBe(true);
    expect(json1.deduped).toBe(false);

    const req2 = new Request("http://localhost/api/inbound/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dev-webhook-secret": process.env.DEV_WEBHOOK_SECRET!,
      },
      body: JSON.stringify(body),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.ok).toBe(true);
    expect(json2.deduped).toBe(true);
  });
});
