import type { WorkerEnv } from "types/env";
import type { ChannelPort, IncomingUserMessage, SendMessageInput } from "@/ports/channel.port";

function toIsoTimestamp(timestamp: unknown): string {
  if (typeof timestamp === "string" && timestamp.length > 0) return timestamp;
  if (typeof timestamp === "number") return new Date(timestamp * 1000).toISOString();
  return new Date().toISOString();
}

function normalizeBaseUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseSignatureHeader(signatureHeader: string | null): string | null {
  if (!signatureHeader) return null;
  const raw = signatureHeader.trim();
  if (!raw) return null;

  if (raw.startsWith("v1=")) {
    const value = raw.slice(3).trim();
    return value.length > 0 ? value.toLowerCase() : null;
  }

  return raw.toLowerCase();
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

function resolveProviderEventId(payload: Record<string, unknown>): string | null {
  const directCandidates: Array<unknown> = [
    payload.id,
    payload.eventId,
    payload.event_id,
    payload.messageId,
    payload.message_id,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  const nestedMessage = payload.message;
  if (nestedMessage && typeof nestedMessage === "object") {
    const nestedRecord = nestedMessage as Record<string, unknown>;
    const nestedCandidates: Array<unknown> = [nestedRecord.id, nestedRecord.messageId, nestedRecord.message_id];
    for (const candidate of nestedCandidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function extractIncomingMessage(
  payload: Record<string, unknown>,
  providerEventId: string,
  payloadHash: string,
): IncomingUserMessage | null {
  const from =
    (typeof payload.userId === "string" && payload.userId) ||
    (typeof payload.from === "string" && payload.from) ||
    (typeof payload.phone === "string" && payload.phone) ||
    null;

  const text =
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.message === "string" && payload.message) ||
    null;

  if (from && text) {
    return {
      channel: "whatsapp",
      userId: from,
      text,
      timestamp: toIsoTimestamp(payload.timestamp),
      providerEventId,
      payloadHash,
      raw: payload,
    };
  }

  const nested = payload.message;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    const nestedFrom = typeof nestedRecord.from === "string" ? nestedRecord.from : null;
    const nestedText = typeof nestedRecord.text === "string" ? nestedRecord.text : null;

    if (nestedFrom && nestedText) {
      return {
        channel: "whatsapp",
        userId: nestedFrom,
        text: nestedText,
        timestamp: toIsoTimestamp(nestedRecord.timestamp),
        providerEventId,
        payloadHash,
        raw: payload,
      };
    }
  }

  return null;
}

export function createKapsoChannelAdapter(env: WorkerEnv): ChannelPort {
  const baseUrl = normalizeBaseUrl(env.KAPSO_API_BASE_URL);
  const signatureMode = env.KAPSO_WEBHOOK_SIGNATURE_MODE ?? "dual";
  const maxSkewSeconds = parsePositiveInt(env.KAPSO_WEBHOOK_MAX_SKEW_SECONDS, 300);

  return {
    async sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }> {
      if (!baseUrl || !env.KAPSO_API_KEY) {
        return { providerMessageId: "kapso-noop" };
      }

      const response = await fetch(`${baseUrl}/platform/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.KAPSO_API_KEY}`,
        },
        body: JSON.stringify({
          to: input.userId,
          text: input.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Kapso sendMessage failed (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as { id?: string; message_id?: string };
      return { providerMessageId: payload.id ?? payload.message_id ?? "kapso-unknown" };
    },

    async parseWebhook(request: Request): Promise<IncomingUserMessage | null> {
      const rawBody = await request.text();
      const payload = JSON.parse(rawBody) as unknown;
      if (!payload || typeof payload !== "object") return null;

      const payloadRecord = payload as Record<string, unknown>;
      const payloadHash = await sha256Hex(rawBody);
      const resolvedEventId = resolveProviderEventId(payloadRecord) ?? `hash:${payloadHash}`;

      return extractIncomingMessage(payloadRecord, resolvedEventId, payloadHash);
    },

    async verifyWebhook(input: { headers: Headers; rawBody: string }): Promise<boolean> {
      const expected = env.KAPSO_WEBHOOK_SECRET;
      if (!expected) return true;

      const providedRaw = input.headers.get("x-kapso-signature");
      const providedSignature = parseSignatureHeader(providedRaw);

      const timestampRaw = input.headers.get("x-kapso-timestamp");
      const timestamp = parsePositiveInt(timestampRaw ?? undefined, 0);
      const hasTimestamp = timestamp > 0;
      const now = Math.floor(Date.now() / 1000);

      const isHmacValid = await (async () => {
        if (!hasTimestamp || !providedSignature) return false;
        if (Math.abs(now - timestamp) > maxSkewSeconds) return false;

        const canonicalPayload = `${timestamp}.${input.rawBody}`;
        const expectedSignature = await hmacSha256Hex(expected, canonicalPayload);

        const providedBytes = hexToBytes(providedSignature);
        const expectedBytes = hexToBytes(expectedSignature);
        if (!providedBytes || !expectedBytes) return false;

        return constantTimeEquals(providedBytes, expectedBytes);
      })();

      if (isHmacValid) return true;
      if (signatureMode === "strict") return false;

      return providedRaw === expected;
    },
  };
}
