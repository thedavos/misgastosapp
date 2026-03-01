import type { WorkerEnv } from "types/env";
import type { ChannelPort, IncomingUserMessage, SendMessageInput } from "@/ports/channel.port";
import { constantTimeEquals } from "@/utils/crypto/constantTimeEquals";
import { hexToBytes } from "@/utils/crypto/hexToBytes";
import { hmacSha256Hex } from "@/utils/crypto/hmacSha256Hex";
import { sha256Hex } from "@/utils/crypto/sha256Hex";
import { toIsoTimestamp } from "@/utils/date/toIsoTimestamp";
import { parsePositiveInt } from "@/utils/number/parsePositiveInt";
import { normalizeBaseUrl } from "@/utils/url/normalizeBaseUrl";

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

function extractImageAttachments(payload: Record<string, unknown>) {
  const attachments: Array<{ type: "image"; url?: string; mimeType?: string; providerFileId?: string }> = [];

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
  const attachments = extractImageAttachments(payload);

  if (from && (text || attachments.length > 0)) {
    return {
      channel: "whatsapp",
      userId: from,
      text: text ?? "",
      timestamp: toIsoTimestamp(payload.timestamp),
      providerEventId,
      payloadHash,
      attachments,
      raw: payload,
    };
  }

  const nested = payload.message;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    const nestedFrom = typeof nestedRecord.from === "string" ? nestedRecord.from : null;
    const nestedText = typeof nestedRecord.text === "string" ? nestedRecord.text : null;
    const nestedAttachments = extractImageAttachments(nestedRecord);

    if (nestedFrom && (nestedText || nestedAttachments.length > 0)) {
      return {
        channel: "whatsapp",
        userId: nestedFrom,
        text: nestedText ?? "",
        timestamp: toIsoTimestamp(nestedRecord.timestamp),
        providerEventId,
        payloadHash,
        attachments: nestedAttachments.length > 0 ? nestedAttachments : attachments,
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
