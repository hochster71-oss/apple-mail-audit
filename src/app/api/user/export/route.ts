import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { getRequestId } from "@/lib/security/request";
import { HttpError, jsonError } from "@/lib/security/http";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Not signed in");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        forwarding: { select: { localPart: true, createdAt: true, isActive: true } },
        inboundEmails: {
          orderBy: { receivedAt: "desc" },
          select: { id: true, receivedAt: true, from: true, to: true, subject: true, date: true, snippet: true, rawStored: true },
        },
        parsedItems: {
          orderBy: { lastSeenAt: "desc" },
          select: {
            id: true,
            type: true,
            status: true,
            confidence: true,
            merchant: true,
            product: true,
            amount: true,
            currency: true,
            transactionDate: true,
            renewalDate: true,
            isRecurring: true,
            cancelUrl: true,
            inboundEmailId: true,
            evidenceJson: true,
            lastSeenAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

    await writeAuditLog({ userId, type: "USER_EXPORT", requestId, details: { exported: true } });

    return Response.json({ ok: true, user, requestId });
  } catch (e) {
    return jsonError(e, requestId);
  }
}
