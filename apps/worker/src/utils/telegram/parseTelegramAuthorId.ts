import { asIdString } from "@/utils/id/asIdString";

export function parseTelegramAuthorId(thread: unknown, message: unknown): string | null {
  const msg = (message ?? {}) as Record<string, unknown>;
  const author = msg.author as Record<string, unknown> | undefined;
  if (author) {
    const authorId = asIdString(author.id);
    if (authorId) return authorId;
  }

  const thr = (thread ?? {}) as Record<string, unknown>;
  const threadAuthor = thr.author as Record<string, unknown> | undefined;
  if (threadAuthor) {
    const authorId = asIdString(threadAuthor.id);
    if (authorId) return authorId;
  }

  return null;
}
