import type { ChannelPort, IncomingUserMessage, SendMessageInput } from "@/ports/channel.port";

export function createInstagramChannelAdapter(): ChannelPort {
  return {
    async sendMessage(_input: SendMessageInput): Promise<{ providerMessageId: string }> {
      return { providerMessageId: "instagram-not-implemented" };
    },
    async parseWebhook(_request: Request): Promise<IncomingUserMessage | null> {
      return null;
    },
    async verifyWebhook(_request: Request): Promise<boolean> {
      return true;
    },
  };
}
