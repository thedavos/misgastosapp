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

function extractIncomingMessage(payload: Record<string, unknown>): IncomingUserMessage | null {
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
        raw: payload,
      };
    }
  }

  return null;
}

export function createKapsoChannelAdapter(env: WorkerEnv): ChannelPort {
  const baseUrl = normalizeBaseUrl(env.KAPSO_API_BASE_URL);

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
      const payload = (await request.json()) as unknown;
      if (!payload || typeof payload !== "object") return null;
      return extractIncomingMessage(payload as Record<string, unknown>);
    },

    async verifyWebhook(request: Request): Promise<boolean> {
      const expected = env.KAPSO_WEBHOOK_SECRET;
      if (!expected) return true;
      const provided = request.headers.get("x-kapso-signature");
      return provided === expected;
    },
  };
}
