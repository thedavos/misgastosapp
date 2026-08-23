export type WebhookProcessingStatus =
  | "NEW"
  | "DUPLICATE_PROCESSED"
  | "DUPLICATE_INFLIGHT"
  | "RETRY_ALLOWED";

export interface WebhookEventRepoPort {
  tryStartProcessing(input: {
    provider: string;
    eventId: string;
    payloadHash: string;
    requestId?: string;
  }): Promise<WebhookProcessingStatus>;
  markProcessed(input: { provider: string; eventId: string }): Promise<void>;
  markFailed(input: { provider: string; eventId: string; errorMessage: string }): Promise<void>;
  cleanupOld(input: { provider: string; retentionDays: number }): Promise<void>;
}
