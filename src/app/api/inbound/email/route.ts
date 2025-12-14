import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";
import { getClientIp, getRequestId, safeUserAgent } from "@/lib/security/request";
import { HttpError, jsonError } from "@/lib/security/http";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import { hmacSha256Hex, sha256Hex, timingSafeEqualHex } from "@/lib/crypto/hash";
import { inboundPayloadSchema, normalizeInboundEmail } from "@/lib/email/normalize";
import { analyzeEmailWithLlm } from "@/lib/email/analyze";
import { parseEmailToItems, sanitizeUrl } from "@/lib/parsing/pipeline";
import { computeStatus } from "@/lib/parsing/status";
import { encryptRawEmail } from "@/lib/crypto/encryption";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

function verifyDevSecret(request: Request, logger: { warn: (...args: any[]) => any }) {
  const devSecret = env.DEV_WEBHOOK_SECRET;
  const provided = request.headers.get("x-dev-webhook-secret");
  if (!devSecret) {
    throw new HttpError(403, "DEV_SECRET_DISABLED", "DEV_WEBHOOK_SECRET not configured");
  }
  if (!provided || provided !== devSecret) {
    if (env.NODE_ENV !== "production") {
      logger.warn(
        {
          providedLen: provided?.length ?? 0,
          expectedLen: devSecret.length,
          providedHash: provided ? sha256Hex(provided).slice(0, 8) : null,
          expectedHash: sha256Hex(devSecret).slice(0, 8),
        },
        "inbound_dev_secret_mismatch"
      );
    }
    throw new HttpError(401, "UNAUTHORIZED", "Invalid dev webhook secret");
  }
}

function verifyProdSignature(rawBody: Buffer, request: Request) {
  const sig = request.headers.get("x-webhook-signature");
  const ts = request.headers.get("x-webhook-timestamp");
  if (!sig || !ts) throw new HttpError(401, "UNAUTHORIZED", "Missing webhook signature headers");

  // Simple HMAC scheme: hex(hmac(secret, `${ts}.${rawBody}`))
  const payload = `${ts}.${rawBody.toString("utf8")}`;
  const expected = hmacSha256Hex(env.WEBHOOK_SECRET, payload);
  if (!timingSafeEqualHex(sig, expected)) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid webhook signature");
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const ip = getClientIp(request);
  const userAgent = safeUserAgent(request);
  const logger = log.child({ requestId });

  try {
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.byteLength > env.INBOUND_MAX_BYTES) {
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Inbound payload too large");
    }

    const devSecretHeader = request.headers.get("x-dev-webhook-secret");
    const hasProdSig =
      !!request.headers.get("x-webhook-signature") || !!request.headers.get("x-webhook-timestamp");

    let skipRateLimit = false;

    if (env.NODE_ENV === "production") {
      verifyProdSignature(raw, request);
      skipRateLimit = true;
    } else if (hasProdSig) {
      verifyProdSignature(raw, request);
      skipRateLimit = true;
    } else if (request.headers.get("x-dev-webhook-secret")) {
      verifyDevSecret(request, logger);
      skipRateLimit = true;
    } else if (env.DEV_WEBHOOK_SECRET) {
      throw new HttpError(401, "UNAUTHORIZED", "Missing x-dev-webhook-secret");
    } else {
      throw new HttpError(403, "DEV_SECRET_DISABLED", "Set DEV_WEBHOOK_SECRET to enable dev ingestion");
    }

    if (!skipRateLimit) {
      await rateLimitOrThrow({
        key: `inbound:${ip ?? "unknown"}`,
        limit: 30,
        windowMs: 60_000,
      });
    }

    const json = JSON.parse(raw.toString("utf8"));
    const payload = inboundPayloadSchema.parse(json);
    const normalized = normalizeInboundEmail(payload);

    const forwarding = await prisma.forwardingAddress.findUnique({
      where: { localPart: normalized.localPart },
      select: { userId: true, isActive: true },
    });

    if (!forwarding || !forwarding.isActive) {
      await writeAuditLog({
        type: "INBOUND_REJECTED",
        requestId,
        ip,
        userAgent,
        details: { reason: "Unknown forwarding address", localPart: normalized.localPart },
      });
      throw new HttpError(404, "FORWARDING_NOT_FOUND", "Forwarding address not found");
    }

    const userId = forwarding.userId;

    const result = await prisma.$transaction(async (tx) => {
      // Purge expired raw blobs opportunistically
      await tx.rawEmailBlob.deleteMany({ where: { expiresAt: { lt: new Date() } } });

      let inbound = null as null | { id: string; receivedAt: Date; date: Date | null };
      try {
        inbound = await tx.inboundEmail.create({
          data: {
            userId,
            messageIdHash: normalized.messageIdHash,
            from: normalized.from,
            to: normalized.to,
            subject: normalized.subject,
            date: normalized.date,
            snippet: normalized.snippet,
            rawStored: false,
          },
          select: { id: true, receivedAt: true, date: true },
        });
      } catch (e: any) {
        if (String(e?.code) === "P2002") {
          return { deduped: true as const, inboundId: null as string | null, created: 0 };
        }
        throw e;
      }

      if (env.ENABLE_RAW_EMAIL_STORAGE) {
        const enc = encryptRawEmail(normalized.plainText);
        const ttlMs = env.RAW_EMAIL_TTL_DAYS * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + ttlMs);
        await tx.rawEmailBlob.create({
          data: {
            userId,
            inboundId: inbound.id,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            tag: enc.tag,
            expiresAt,
          },
        });
        await tx.inboundEmail.update({
          where: { id: inbound.id },
          data: { rawStored: true, rawRef: "raw_email_blob" },
        });
      }

      const lastSeenAt = inbound.date ?? inbound.receivedAt;
      const items = await parseEmailToItems(normalized);

      for (const item of items) {
        const status = computeStatus({ core: item, lastSeenAt });
        await tx.parsedItem.create({
          data: {
            userId,
            inboundEmailId: inbound.id,
            type: item.type,
            status: status.status,
            confidence: item.confidence,
            merchant: item.merchant,
            product: item.product,
            amount: item.amount ?? null,
            currency: item.currency,
            transactionDate: item.transactionDate ?? null,
            renewalDate: item.renewalDate ?? null,
            isRecurring: item.isRecurring,
            cancelUrl: sanitizeUrl(item.cancelUrl) ?? null,
            evidenceJson: {
              reason: item.evidenceReason,
              snippets: item.evidenceSnippets,
              statusReason: status.reason,
              llmUsed: item.llmUsed,
              llmUnavailable: item.llmUnavailable ?? false,
            },
            lastSeenAt,
          },
        });
      }

      return { deduped: false as const, inboundId: inbound.id, created: items.length };
    });

    if (result.deduped) {
      await writeAuditLog({
        userId,
        type: "INBOUND_DEDUPED",
        requestId,
        ip,
        userAgent,
        details: { messageIdHash: normalized.messageIdHash },
      });
      return Response.json({ ok: true, deduped: true, requestId });
    }

    const analysis = await analyzeEmailWithLlm(normalized);
    if (analysis.ok && result.inboundId) {
      await prisma.emailAnalysis.upsert({
        where: { inboundEmailId: result.inboundId },
        update: {
          summary: analysis.data.summary,
          categories: analysis.data.categories,
          risks: analysis.data.risks,
          model: analysis.data.model,
        },
        create: {
          inboundEmailId: result.inboundId,
          summary: analysis.data.summary,
          categories: analysis.data.categories,
          risks: analysis.data.risks,
          model: analysis.data.model,
        },
      });
    } else if (!analysis.ok) {
      logger.warn({ reason: analysis.reason, messageIdHash: normalized.messageIdHash }, "analysis_failed");
    }

    await writeAuditLog({
      userId,
      type: "INBOUND_ACCEPTED",
      requestId,
      ip,
      userAgent,
      details: { messageIdHash: normalized.messageIdHash, createdItems: result.created },
    });

    logger.info({ userId, createdItems: result.created }, "inbound_processed");
    return Response.json({ ok: true, deduped: false, createdItems: result.created, requestId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    log.warn({ requestId, err: message }, "inbound_failed");
    return jsonError(e, requestId);
  }
}
