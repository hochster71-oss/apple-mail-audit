import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@example.com";
  const password = "demo12345";

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
    },
  });

  const localPart = "audit-demo";
  await prisma.forwardingAddress.upsert({
    where: { localPart },
    update: { userId: user.id, isActive: true },
    create: {
      userId: user.id,
      localPart,
      isActive: true,
    },
  });

  // Basic audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      type: "AUTH_LOGIN_SUCCESS",
      details: {
        message: "Seed created demo user",
        demo: { email, password, forwarding: `${localPart}@mail.audit.local` },
      },
    },
  });

  await prisma.icloudSyncConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      enabled: false,
      mailbox: "INBOX",
      limit: 250,
      sinceDays: 365,
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seeded demo user:");
  // eslint-disable-next-line no-console
  console.log({ email, password, forwarding: `${localPart}@mail.audit.local` });
}

// Keep randomBytes imported (used previously) to avoid unused import errors across environments.
void randomBytes;

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
