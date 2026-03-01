import type { WorkerEnv } from "types/env";
import type { ChatMedia, ChatMediaRepoPort } from "@/ports/chat-media-repo.port";

type ChatMediaRow = {
  id: string;
  customer_id: string;
  channel: string;
  external_user_id: string;
  provider_event_id: string;
  expense_id: string | null;
  r2_key: string;
  mime_type: string | null;
  size_bytes: number;
  sha256: string;
  ocr_text: string | null;
  created_at: string;
  expires_at: string;
};

function mapChatMediaRow(row: ChatMediaRow): ChatMedia {
  return {
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel,
    externalUserId: row.external_user_id,
    providerEventId: row.provider_event_id,
    expenseId: row.expense_id,
    r2Key: row.r2_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    ocrText: row.ocr_text,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function createD1ChatMediaRepo(env: WorkerEnv): ChatMediaRepoPort {
  return {
    async create(input): Promise<ChatMedia> {
      const id = crypto.randomUUID();

      await env.REPORTS.put(input.r2Key, input.data, {
        httpMetadata: input.mimeType ? { contentType: input.mimeType } : undefined,
      });

      await env.DB.prepare(
        `INSERT INTO chat_media (
           id,
           customer_id,
           channel,
           external_user_id,
           provider_event_id,
           expense_id,
           r2_key,
           mime_type,
           size_bytes,
           sha256,
           ocr_text,
           created_at,
           expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          input.customerId,
          input.channel,
          input.externalUserId,
          input.providerEventId,
          input.expenseId,
          input.r2Key,
          input.mimeType,
          input.sizeBytes,
          input.sha256,
          input.ocrText,
          input.createdAt,
          input.expiresAt,
        )
        .run();

      return {
        id,
        customerId: input.customerId,
        channel: input.channel,
        externalUserId: input.externalUserId,
        providerEventId: input.providerEventId,
        expenseId: input.expenseId,
        r2Key: input.r2Key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        ocrText: input.ocrText,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      };
    },

    async linkExpense(input): Promise<void> {
      await env.DB.prepare(
        `UPDATE chat_media
         SET expense_id = ?
         WHERE id = ?`,
      )
        .bind(input.expenseId, input.id)
        .run();
    },

    async listByExpenseId(input): Promise<ChatMedia[]> {
      const rows = await env.DB.prepare(
        `SELECT
           id,
           customer_id,
           channel,
           external_user_id,
           provider_event_id,
           expense_id,
           r2_key,
           mime_type,
           size_bytes,
           sha256,
           ocr_text,
           created_at,
           expires_at
         FROM chat_media
         WHERE customer_id = ? AND expense_id = ?`,
      )
        .bind(input.customerId, input.expenseId)
        .all<ChatMediaRow>();

      return rows.results.map(mapChatMediaRow);
    },

    async deleteExpired(input): Promise<number> {
      const limit = input.limit ?? 200;
      const expiredRows = await env.DB.prepare(
        `SELECT id, r2_key
         FROM chat_media
         WHERE expires_at < ?
         LIMIT ?`,
      )
        .bind(input.nowIso, limit)
        .all<{ id: string; r2_key: string }>();

      for (const row of expiredRows.results) {
        await env.REPORTS.delete(row.r2_key);
      }

      await env.DB.prepare(
        `DELETE FROM chat_media
         WHERE id IN (
           SELECT id
           FROM chat_media
           WHERE expires_at < ?
           LIMIT ?
         )`,
      )
        .bind(input.nowIso, limit)
        .run();

      return expiredRows.results.length;
    },
  };
}
