import { describe, expect, test } from "vitest";
import { sha256Hex } from "@/lib/crypto/hash";

describe("dedup key", () => {
  test("sha256Hex stable", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
  });
});
