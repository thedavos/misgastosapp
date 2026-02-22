export interface IncomingUserMessage {
  channel: string;
  userId: string;
  text: string;
  timestamp: string;
  raw: unknown;
}

export interface SendMessageInput {
  userId: string;
  text: string;
}

export interface ChannelPort {
  sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }>;
  parseWebhook(request: Request): Promise<IncomingUserMessage | null>;
  verifyWebhook(request: Request): Promise<boolean>;
}
