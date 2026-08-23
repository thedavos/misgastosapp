const AES_GCM_ALGORITHM = "AES-GCM";
const IV_LENGTH_BYTES = 12;
const FORMAT_VERSION = "v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(rawKeyBase64: string): Promise<CryptoKey> {
  const rawKey = fromBase64(rawKeyBase64);
  if (rawKey.byteLength !== 32) {
    throw new Error("USER_AI_GATEWAY_ENC_KEY must decode to 32 bytes (AES-256)");
  }

  return crypto.subtle.importKey(
    "raw",
    rawKey as unknown as BufferSource,
    AES_GCM_ALGORITHM,
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(plaintext: string, rawKeyBase64: string): Promise<string> {
  const key = await importKey(rawKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_GCM_ALGORITHM, iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as unknown as BufferSource,
  );

  return `${FORMAT_VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(encrypted: string, rawKeyBase64: string): Promise<string> {
  const parts = encrypted.split(".");
  if (parts.length !== 3 || parts[0] !== FORMAT_VERSION) {
    throw new Error("Unsupported encrypted secret format");
  }

  const key = await importKey(rawKeyBase64);
  const plaintext = await crypto.subtle.decrypt(
    { name: AES_GCM_ALGORITHM, iv: fromBase64(parts[1]) as unknown as BufferSource },
    key,
    fromBase64(parts[2]) as unknown as BufferSource,
  );

  return new TextDecoder().decode(plaintext);
}
