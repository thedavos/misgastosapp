import type { WorkerEnv } from "types/env";
import type { ChannelPort, IncomingUserMessage, SendMessageInput } from "@/ports/channel.port";
import { constantTimeEquals } from "@/utils/crypto/constantTimeEquals";
import { hexToBytes } from "@/utils/crypto/hexToBytes";
import { hmacSha256Hex } from "@/utils/crypto/hmacSha256Hex";
import { sha256Hex } from "@/utils/crypto/sha256Hex";
import { toIsoTimestamp } from "@/utils/date/toIsoTimestamp";
import { parsePositiveInt } from "@/utils/number/parsePositiveInt";
import { normalizeBaseUrl } from "@/utils/url/normalizeBaseUrl";

const KAPSO_META_WHATSAPP_BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

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

async function signaturesMatch(providedHex: string, expectedHex: string): Promise<boolean> {
  const providedBytes = hexToBytes(providedHex);
  const expectedBytes = hexToBytes(expectedHex);
  if (!providedBytes || !expectedBytes) return false;
  return constantTimeEquals(providedBytes, expectedBytes);
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
    const nestedCandidates: Array<unknown> = [
      nestedRecord.id,
      nestedRecord.messageId,
      nestedRecord.message_id,
    ];
    for (const candidate of nestedCandidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function extractImageAttachments(payload: Record<string, unknown>) {
  const attachments: Array<{
    type: "image";
    url?: string;
    mimeType?: string;
    providerFileId?: string;
  }> = [];

  const maybePush = (url: unknown, mimeType: unknown, providerFileId: unknown) => {
    if (typeof url !== "string" || url.trim().length === 0) return;
    attachments.push({
      type: "image",
      url: url.trim(),
      mimeType: typeof mimeType === "string" ? mimeType : undefined,
      providerFileId: typeof providerFileId === "string" ? providerFileId : undefined,
    });
  };

  maybePush(payload.mediaUrl, payload.mediaMimeType, payload.mediaId);
  maybePush(payload.media_url, payload.media_mime_type, payload.media_id);
  maybePush(payload.imageUrl, payload.imageMimeType, payload.imageId);
  maybePush(payload.image_url, payload.image_mime_type, payload.image_id);

  const media = payload.media;
  if (media && typeof media === "object") {
    const mediaRecord = media as Record<string, unknown>;
    maybePush(mediaRecord.url, mediaRecord.mimeType, mediaRecord.id);
  }

  const image = payload.image;
  if (image && typeof image === "object") {
    const imageRecord = image as Record<string, unknown>;
    maybePush(imageRecord.link, imageRecord.mime_type, imageRecord.id);
  }

  const kapso = payload.kapso;
  if (kapso && typeof kapso === "object") {
    const kapsoRecord = kapso as Record<string, unknown>;
    maybePush(kapsoRecord.media_url, undefined, undefined);
    const mediaData = kapsoRecord.media_data;
    if (mediaData && typeof mediaData === "object") {
      const mediaDataRecord = mediaData as Record<string, unknown>;
      maybePush(mediaDataRecord.url, mediaDataRecord.content_type, undefined);
    }
  }

  const mediaList = payload.attachments;
  if (Array.isArray(mediaList)) {
    for (const rawAttachment of mediaList) {
      if (!rawAttachment || typeof rawAttachment !== "object") continue;
      const attachment = rawAttachment as Record<string, unknown>;
      const rawType = typeof attachment.type === "string" ? attachment.type.toLowerCase() : "";
      const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType : undefined;
      const isImage = rawType === "image" || (mimeType ? mimeType.startsWith("image/") : false);
      if (!isImage) continue;
      maybePush(attachment.url, mimeType, attachment.id);
    }
  }

  return attachments;
}

function extractText(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.body === "string" && record.body.trim().length > 0) {
      return record.body.trim();
    }
    if (typeof record.content === "string" && record.content.trim().length > 0) {
      return record.content.trim();
    }
  }
  return null;
}

function isInboundKapsoMessage(message: Record<string, unknown>): boolean {
  const kapso = message.kapso;
  if (!kapso || typeof kapso !== "object") return true;
  const direction = (kapso as Record<string, unknown>).direction;
  if (typeof direction !== "string") return true;
  return direction.toLowerCase() === "inbound";
}

function unwrapWebhookPayloads(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (payload.batch === true && Array.isArray(payload.data)) {
    return payload.data.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object",
    );
  }
  return [payload];
}

function extractIncomingMessage(
  payload: Record<string, unknown>,
  providerEventId: string,
  payloadHash: string,
): IncomingUserMessage | null {
  // Kapso Platform v2: message + conversation envelope
  const nested = payload.message;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (!isInboundKapsoMessage(nestedRecord)) return null;

    const conversation =
      payload.conversation && typeof payload.conversation === "object"
        ? (payload.conversation as Record<string, unknown>)
        : null;

    const nestedFrom =
      (typeof nestedRecord.from === "string" && nestedRecord.from) ||
      (typeof conversation?.phone_number === "string" && conversation.phone_number) ||
      null;

    const nestedText =
      extractText(nestedRecord.text) ||
      (nestedRecord.kapso && typeof nestedRecord.kapso === "object"
        ? extractText((nestedRecord.kapso as Record<string, unknown>).content)
        : null);

    const nestedAttachments = extractImageAttachments(nestedRecord);
    if (nestedFrom && (nestedText || nestedAttachments.length > 0)) {
      return {
        channel: "whatsapp",
        externalUserId: nestedFrom,
        text: nestedText ?? "",
        timestamp: toIsoTimestamp(nestedRecord.timestamp),
        providerEventId,
        payloadHash,
        attachments: nestedAttachments,
        raw: payload,
      };
    }
  }

  // Legacy flat fixture payload
  const from =
    (typeof payload.userId === "string" && payload.userId) ||
    (typeof payload.from === "string" && payload.from) ||
    (typeof payload.phone === "string" && payload.phone) ||
    null;

  const text = extractText(payload.text) || extractText(payload.message);
  const attachments = extractImageAttachments(payload);

  if (from && (text || attachments.length > 0)) {
    return {
      channel: "whatsapp",
      externalUserId: from,
      text: text ?? "",
      timestamp: toIsoTimestamp(payload.timestamp),
      providerEventId,
      payloadHash,
      attachments,
      raw: payload,
    };
  }

  return null;
}

export function createKapsoChannelAdapter(env: WorkerEnv): ChannelPort {
  const signatureMode = env.KAPSO_WEBHOOK_SIGNATURE_MODE ?? "dual";
  const maxSkewSeconds = parsePositiveInt(env.KAPSO_WEBHOOK_MAX_SKEW_SECONDS, 300);
  const phoneNumberId = env.KAPSO_PHONE_NUMBER_ID?.trim();

  return {
    async sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }> {
      if (!env.KAPSO_API_KEY || !phoneNumberId) {
        return { providerMessageId: "kapso-noop" };
      }

      const metaBase =
        normalizeBaseUrl(env.KAPSO_META_WHATSAPP_BASE_URL) ?? KAPSO_META_WHATSAPP_BASE;
      const response = await fetch(`${metaBase}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": env.KAPSO_API_KEY,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.externalUserId,
          type: "text",
          text: { body: input.text },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Kapso sendMessage failed (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as {
        messages?: Array<{ id?: string }>;
        id?: string;
        message_id?: string;
      };
      return {
        providerMessageId:
          payload.messages?.[0]?.id ?? payload.id ?? payload.message_id ?? "kapso-unknown",
      };
    },

    async parseWebhook(request: Request): Promise<IncomingUserMessage | null> {
      const rawBody = await request.text();
      const payload = JSON.parse(rawBody) as unknown;
      if (!payload || typeof payload !== "object") return null;

      const payloadRecord = payload as Record<string, unknown>;
      const payloadHash = await sha256Hex(rawBody);
      const candidates = unwrapWebhookPayloads(payloadRecord);

      for (const candidate of candidates) {
        const resolvedEventId = resolveProviderEventId(candidate) ?? `hash:${payloadHash}`;
        const message = extractIncomingMessage(candidate, resolvedEventId, payloadHash);
        if (message) return message;
      }

      return null;
    },

    async verifyWebhook(input: { headers: Headers; rawBody: string }): Promise<boolean> {
      const expected = env.KAPSO_WEBHOOK_SECRET?.trim();
      if (!expected) return false;

      // Kapso Platform current contract: X-Webhook-Signature = HMAC-SHA256(rawBody)
      const platformSignature = parseSignatureHeader(input.headers.get("x-webhook-signature"));
      if (platformSignature) {
        const expectedSignature = await hmacSha256Hex(expected, input.rawBody);
        if (await signaturesMatch(platformSignature, expectedSignature)) {
          return true;
        }
      }

      // Legacy Misgastos contract: x-kapso-signature + x-kapso-timestamp over `${timestamp}.${rawBody}`
      const providedRaw = input.headers.get("x-kapso-signature");
      const providedSignature = parseSignatureHeader(providedRaw);
      const timestampRaw = input.headers.get("x-kapso-timestamp");
      const timestamp = parsePositiveInt(timestampRaw ?? undefined, 0);
      const hasTimestamp = timestamp > 0;
      const now = Math.floor(Date.now() / 1000);

      const isLegacyHmacValid = await (async () => {
        if (!hasTimestamp || !providedSignature) return false;
        if (Math.abs(now - timestamp) > maxSkewSeconds) return false;

        const canonicalPayload = `${timestamp}.${input.rawBody}`;
        const expectedSignature = await hmacSha256Hex(expected, canonicalPayload);
        return signaturesMatch(providedSignature, expectedSignature);
      })();

      if (isLegacyHmacValid) return true;
      if (signatureMode === "strict") return false;

      if (!providedRaw) return false;
      const providedBytes = new TextEncoder().encode(providedRaw);
      const expectedBytes = new TextEncoder().encode(expected);
      return constantTimeEquals(providedBytes, expectedBytes);
    },
  };
}
