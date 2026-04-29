export interface IncomingAttachment {
  type: "image";
  url?: string;
  mimeType?: string;
  providerFileId?: string;
  data?: Uint8Array;
}

export interface IncomingUserMessage {
  channel: string;
  externalUserId: string;
  text: string;
  timestamp: string;
  providerEventId?: string;
  payloadHash?: string;
  attachments?: IncomingAttachment[];
  raw: unknown;
}

export interface SendMessageInput {
  externalUserId: string;
  text: string;
}

export interface ChannelPort {
  sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }>;
  parseWebhook(request: Request): Promise<IncomingUserMessage | null>;
  verifyWebhook(input: { headers: Headers; rawBody: string }): Promise<boolean>;
}
