import type { IncomingAttachment } from "@/ports/channel.port";

export async function normalizeTelegramAttachments(message: unknown): Promise<IncomingAttachment[]> {
  const msg = (message ?? {}) as Record<string, unknown>;
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];

  const normalized: IncomingAttachment[] = [];

  for (const rawAttachment of attachments) {
    if (!rawAttachment || typeof rawAttachment !== "object") continue;
    const attachment = rawAttachment as Record<string, unknown>;

    const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType : undefined;
    const isImage = mimeType ? mimeType.startsWith("image/") : false;
    if (!isImage) continue;

    let data: Uint8Array | undefined;
    const fetchData = attachment.fetchData;
    if (typeof fetchData === "function") {
      const payload = await (fetchData as () => Promise<unknown>)();
      if (payload instanceof Uint8Array) {
        data = payload;
      } else if (payload instanceof ArrayBuffer) {
        data = new Uint8Array(payload);
      }
    }

    normalized.push({
      type: "image",
      mimeType,
      providerFileId: typeof attachment.id === "string" ? attachment.id : undefined,
      url: typeof attachment.url === "string" ? attachment.url : undefined,
      data,
    });
  }

  return normalized;
}
