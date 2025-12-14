import { prisma } from "@/lib/db";

export class RateLimitError extends Error {
  status = 429 as const;
  constructor(message = "Too many requests") {
    super(message);
  }
}

export async function rateLimitOrThrow(opts: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = new Date();
  const windowStartMs = Math.floor(now.getTime() / opts.windowMs) * opts.windowMs;
  const windowStart = new Date(windowStartMs);

  const bucket = await prisma.rateLimitBucket.upsert({
    where: {
      key_windowStart: {
        key: opts.key,
        windowStart,
      },
    },
    create: {
      key: opts.key,
      windowStart,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
    select: { count: true },
  });

  if (bucket.count > opts.limit) {
    throw new RateLimitError();
  }
}
