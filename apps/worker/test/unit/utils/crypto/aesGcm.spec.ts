import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/utils/crypto/aesGcm";

const KEY_BASE64 = "5eYR1MKHlUZyoPnyWbMzJLk3T0NqQwVh8mX2cA9dE7f=";

describe("aesGcm secret encryption", () => {
  it("round-trips a plaintext secret", async () => {
    const plaintext = "sk-or-v1-abc123";
    const encrypted = await encryptSecret(plaintext, KEY_BASE64);

    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    await expect(decryptSecret(encrypted, KEY_BASE64)).resolves.toBe(plaintext);
  });

  it("produces different ciphertexts for the same input", async () => {
    const first = await encryptSecret("same-input", KEY_BASE64);
    const second = await encryptSecret("same-input", KEY_BASE64);

    expect(first).not.toBe(second);
  });

  it("rejects decryption with the wrong key", async () => {
    const encrypted = await encryptSecret("secret", KEY_BASE64);
    const wrongKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    await expect(decryptSecret(encrypted, wrongKey)).rejects.toThrow();
  });

  it("rejects malformed payloads", async () => {
    await expect(decryptSecret("not-valid", KEY_BASE64)).rejects.toThrow(
      "Unsupported encrypted secret format",
    );
  });
});
