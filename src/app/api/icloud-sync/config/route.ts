import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { runIcloudSyncIfEnabled } from "@/lib/icloudSync";

export const runtime = "nodejs";

async function requireSessionUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user.id as string;
}

function ensureCredsPresent() {
  if (!env.ICLOUD_EMAIL || !env.ICLOUD_APP_PASSWORD) {
    return "ICLOUD_EMAIL and ICLOUD_APP_PASSWORD must be set in the server environment";
  }
  return null;
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  mailbox: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  sinceDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export async function GET() {
  const userId = await requireSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cfg = await prisma.icloudSyncConfig.findUnique({ where: { userId } });
  return NextResponse.json({
    config: cfg ?? null,
    hasCreds: !!env.ICLOUD_EMAIL && !!env.ICLOUD_APP_PASSWORD,
  });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const data = parsed.data;

  const credsError = data.enabled ? ensureCredsPresent() : null;
  if (credsError) return NextResponse.json({ error: credsError }, { status: 400 });

  const cfg = await prisma.icloudSyncConfig.upsert({
    where: { userId },
    update: {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.mailbox ? { mailbox: data.mailbox } : {}),
      ...(data.limit ? { limit: data.limit } : {}),
      ...(data.sinceDays ? { sinceDays: data.sinceDays } : {}),
    },
    create: {
      userId,
      enabled: data.enabled ?? false,
      mailbox: data.mailbox ?? env.ICLOUD_MAILBOX,
      limit: data.limit ?? env.ICLOUD_LIMIT,
      sinceDays: data.sinceDays ?? env.ICLOUD_SINCE_DAYS,
    },
  });

  if (cfg.enabled) {
    // Kick off a sync in the background (non-blocking).
    runIcloudSyncIfEnabled().catch(() => undefined);
  }

  return NextResponse.json({ config: cfg, hasCreds: !!env.ICLOUD_EMAIL && !!env.ICLOUD_APP_PASSWORD });
}
