import { createHash, createHmac, timingSafeEqual } from "crypto";

export function sha256Hex(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function timingSafeEqualHex(aHex: string, bHex: string) {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
