import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function writeAuditLog(params: {
  userId?: string | null;
  type:
    | "AUTH_LOGIN_SUCCESS"
    | "AUTH_LOGIN_FAILURE"
    | "AUTH_LOGOUT"
    | "USER_EXPORT"
    | "USER_DELETE"
    | "INBOUND_ACCEPTED"
    | "INBOUND_REJECTED"
    | "INBOUND_DEDUPED"
    | "PARSE_SUCCESS"
    | "PARSE_UNCERTAIN";
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  details: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      type: params.type,
      requestId: params.requestId ?? null,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      details: params.details,
    },
  });
}
