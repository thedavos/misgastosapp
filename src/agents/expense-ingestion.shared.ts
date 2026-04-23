import type { IncomingAttachment } from "@/ports/channel.port";

export const WHATSAPP_PROVIDER = "kapso_whatsapp" as const;
export const EXPENSE_INGESTION_RETRY_DELAYS_SECONDS = [5, 30, 120] as const;
export const EXPENSE_INGESTION_FINAL_RETRY_MESSAGE =
  "Tuvimos un problema procesando tu mensaje. Intenta nuevamente en unos segundos.";

export type ExpenseProcessingAttachment = {
  type: "image";
  url?: string;
  mimeType?: string;
  providerFileId?: string;
};

export type ExpenseProcessingJob = {
  provider: typeof WHATSAPP_PROVIDER;
  eventId: string;
  userId: string;
  channel: "whatsapp";
  externalUserId: string;
  text?: string;
  attachments?: ExpenseProcessingAttachment[];
  raw?: unknown;
  timestamp?: string;
  requestId?: string;
  attempt: number;
};

export function toExpenseProcessingAttachments(
  attachments: IncomingAttachment[] | undefined,
): ExpenseProcessingAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  return attachments.map((attachment) => ({
    type: attachment.type,
    url: attachment.url,
    mimeType: attachment.mimeType,
    providerFileId: attachment.providerFileId,
  }));
}

export function buildExpenseIngestionAgentName(input: {
  userId: string;
  channel: string;
  externalUserId: string;
}): string {
  return `user:${input.userId}|ch:${input.channel}|ext:${input.externalUserId}`;
}

export function parseExpenseProcessingJob(payload: unknown): ExpenseProcessingJob | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const provider = record.provider;
  const eventId = record.eventId;
  const userId = record.userId;
  const channel = record.channel;
  const externalUserId = record.externalUserId;
  const attempt = record.attempt;
  const text = record.text;
  const timestamp = record.timestamp;
  const requestId = record.requestId;

  if (provider !== WHATSAPP_PROVIDER) return null;
  if (typeof eventId !== "string" || eventId.length === 0) return null;
  if (typeof userId !== "string" || userId.length === 0) return null;
  if (channel !== "whatsapp") return null;
  if (typeof externalUserId !== "string" || externalUserId.length === 0) return null;
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 0) return null;
  if (text !== undefined && typeof text !== "string") return null;
  if (timestamp !== undefined && typeof timestamp !== "string") return null;
  if (requestId !== undefined && typeof requestId !== "string") return null;

  let attachments: ExpenseProcessingAttachment[] | undefined;
  const rawAttachments = record.attachments;
  if (rawAttachments !== undefined) {
    if (!Array.isArray(rawAttachments)) return null;
    attachments = [];
    for (const rawAttachment of rawAttachments) {
      if (!rawAttachment || typeof rawAttachment !== "object") return null;
      const attachment = rawAttachment as Record<string, unknown>;
      if (attachment.type !== "image") return null;
      if (attachment.url !== undefined && typeof attachment.url !== "string") return null;
      if (attachment.mimeType !== undefined && typeof attachment.mimeType !== "string") return null;
      if (attachment.providerFileId !== undefined && typeof attachment.providerFileId !== "string")
        return null;
      attachments.push({
        type: "image",
        url: attachment.url as string | undefined,
        mimeType: attachment.mimeType as string | undefined,
        providerFileId: attachment.providerFileId as string | undefined,
      });
    }
  }

  return {
    provider,
    eventId,
    userId,
    channel,
    externalUserId,
    text: text as string | undefined,
    attachments,
    raw: record.raw,
    timestamp: timestamp as string | undefined,
    requestId: requestId as string | undefined,
    attempt,
  };
}
