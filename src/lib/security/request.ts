import { randomUUID } from "crypto";

export function getRequestId(request: Request) {
  const existing = request.headers.get("x-request-id");
  return existing && existing.length < 128 ? existing : randomUUID();
}

export function getClientIp(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  const xrip = request.headers.get("x-real-ip");
  return xrip?.trim() ?? null;
}

export function safeUserAgent(request: Request) {
  const ua = request.headers.get("user-agent");
  if (!ua) return null;
  return ua.length > 256 ? ua.slice(0, 256) : ua;
}
