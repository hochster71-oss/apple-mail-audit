import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { getRequestId } from "@/lib/security/request";
import { HttpError, jsonError } from "@/lib/security/http";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) throw new HttpError(401, "UNAUTHORIZED", "Not signed in");

    await writeAuditLog({ userId, type: "USER_DELETE", requestId, details: { requested: true } });
    await prisma.user.delete({ where: { id: userId } });

    return Response.json({ ok: true, deleted: true, requestId });
  } catch (e) {
    return jsonError(e, requestId);
  }
}
