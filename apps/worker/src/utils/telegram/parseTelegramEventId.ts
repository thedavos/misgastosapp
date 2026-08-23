import { asIdString } from "@/utils/id/asIdString";

export function parseTelegramEventId(thread: unknown, message: unknown): string {
  const msg = (message ?? {}) as Record<string, unknown>;
  const messageId = asIdString(msg.id);
  if (messageId) return messageId;

  const thr = (thread ?? {}) as Record<string, unknown>;
  const threadId = asIdString(thr.id) ?? "thread";
  const createdAt = typeof msg.createdAt === "string" ? msg.createdAt : new Date().toISOString();
  return `${threadId}:${createdAt}`;
}
