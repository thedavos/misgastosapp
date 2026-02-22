import type { ChannelPort, IncomingUserMessage, SendMessageInput } from "@/ports/channel.port";

export function createTelegramChannelAdapter(): ChannelPort {
  return {
    async sendMessage(_input: SendMessageInput): Promise<{ providerMessageId: string }> {
      return { providerMessageId: "telegram-not-implemented" };
    },
    async parseWebhook(_request: Request): Promise<IncomingUserMessage | null> {
      return null;
    },
    async verifyWebhook(_input: { headers: Headers; rawBody: string }): Promise<boolean> {
      return true;
    },
  };
}
