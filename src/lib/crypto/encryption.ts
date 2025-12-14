import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/security/http";

type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

function getKeyOrThrow() {
  const keyB64 = env.RAW_EMAIL_ENCRYPTION_KEY_BASE64;
  if (!keyB64) throw new HttpError(500, "ENCRYPTION_KEY_MISSING", "RAW_EMAIL_ENCRYPTION_KEY_BASE64 not set");
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new HttpError(500, "ENCRYPTION_KEY_INVALID", "Encryption key must be 32 bytes base64");
  return key;
}

export function encryptRawEmail(plainText: string): EncryptedPayload {
  const key = getKeyOrThrow();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptRawEmail(payload: EncryptedPayload): string {
  const key = getKeyOrThrow();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
