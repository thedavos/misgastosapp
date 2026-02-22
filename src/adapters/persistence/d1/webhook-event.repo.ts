import type { WorkerEnv } from "types/env";
import type { WebhookEventRepoPort, WebhookProcessingStatus } from "@/ports/webhook-event-repo.port";

type InboundWebhookEventRow = {
  provider: string;
  event_id: string;
  status: "PROCESSING" | "PROCESSED" | "FAILED";
};

export function createD1WebhookEventRepo(env: WorkerEnv): WebhookEventRepoPort {
  return {
    async tryStartProcessing(input): Promise<WebhookProcessingStatus> {
      const now = new Date().toISOString();

      try {
        await env.DB.prepare(
          `INSERT INTO inbound_webhook_events (
              id,
              provider,
              event_id,
              status,
              payload_hash,
              request_id,
              attempt_count,
              first_seen_at,
              last_seen_at,
              processed_at,
              last_error
            )
            VALUES (?, ?, ?, 'PROCESSING', ?, ?, 1, ?, ?, NULL, NULL)`,
        )
          .bind(crypto.randomUUID(), input.provider, input.eventId, input.payloadHash, input.requestId ?? null, now, now)
          .run();

        return "NEW";
      } catch {
        const existing = await env.DB.prepare(
          `SELECT provider, event_id, status
           FROM inbound_webhook_events
           WHERE provider = ? AND event_id = ?
           LIMIT 1`,
        )
          .bind(input.provider, input.eventId)
          .first<InboundWebhookEventRow>();

        if (!existing) {
          throw new Error("Unable to resolve webhook event state after unique insert collision");
        }

        if (existing.status === "PROCESSED") {
          await env.DB.prepare(
            `UPDATE inbound_webhook_events
             SET last_seen_at = ?,
                 request_id = ?
             WHERE provider = ? AND event_id = ?`,
          )
            .bind(now, input.requestId ?? null, input.provider, input.eventId)
            .run();
          return "DUPLICATE_PROCESSED";
        }

        if (existing.status === "PROCESSING") {
          await env.DB.prepare(
            `UPDATE inbound_webhook_events
             SET last_seen_at = ?,
                 request_id = ?
             WHERE provider = ? AND event_id = ?`,
          )
            .bind(now, input.requestId ?? null, input.provider, input.eventId)
            .run();
          return "DUPLICATE_INFLIGHT";
        }

        const resumed = await env.DB.prepare(
          `UPDATE inbound_webhook_events
           SET status = 'PROCESSING',
               payload_hash = ?,
               request_id = ?,
               attempt_count = attempt_count + 1,
               last_seen_at = ?,
               last_error = NULL
           WHERE provider = ? AND event_id = ? AND status = 'FAILED'`,
        )
          .bind(input.payloadHash, input.requestId ?? null, now, input.provider, input.eventId)
          .run();

        const updatedRows = resumed.meta.changes ?? 0;
        if (updatedRows > 0) {
          return "RETRY_ALLOWED";
        }

        return "DUPLICATE_INFLIGHT";
      }
    },

    async markProcessed(input): Promise<void> {
      const now = new Date().toISOString();

      await env.DB.prepare(
        `UPDATE inbound_webhook_events
         SET status = 'PROCESSED',
             last_seen_at = ?,
             processed_at = ?,
             last_error = NULL
         WHERE provider = ? AND event_id = ?`,
      )
        .bind(now, now, input.provider, input.eventId)
        .run();
    },

    async markFailed(input): Promise<void> {
      const now = new Date().toISOString();

      await env.DB.prepare(
        `UPDATE inbound_webhook_events
         SET status = 'FAILED',
             last_seen_at = ?,
             last_error = ?
         WHERE provider = ? AND event_id = ?`,
      )
        .bind(now, input.errorMessage.slice(0, 2000), input.provider, input.eventId)
        .run();
    },

    async cleanupOld(input): Promise<void> {
      const threshold = new Date(Date.now() - input.retentionDays * 24 * 60 * 60 * 1000).toISOString();

      await env.DB.prepare(
        `DELETE FROM inbound_webhook_events
         WHERE provider = ?
           AND last_seen_at < ?`,
      )
        .bind(input.provider, threshold)
        .run();
    },
  };
}
