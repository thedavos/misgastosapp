import type { WorkerEnv } from "types/env";
import type { ChannelPort, IncomingUserMessage, SendMessageInput } from "@/ports/channel.port";

type TelegramDmRuntime = {
  openDM?: (userId: string) => Promise<{ post: (text: string) => Promise<void> }>;
};

let cachedRuntime: Promise<TelegramDmRuntime | null> | null = null;

async function getTelegramDmRuntime(env: WorkerEnv): Promise<TelegramDmRuntime | null> {
  if (!cachedRuntime) {
    cachedRuntime = (async () => {
      const chatPackageName = "chat";
      const telegramAdapterPackageName = "@chat-adapter/telegram";
      try {
        const chatModule = (await import(chatPackageName)) as Record<string, unknown>;
        const telegramAdapterModule = (await import(telegramAdapterPackageName)) as Record<string, unknown>;
        const ChatCtor = chatModule.Chat as
          | (new (input: {
              userName: string;
              adapters: Record<string, unknown>;
              streamingUpdateIntervalMs?: number;
            }) => TelegramDmRuntime)
          | undefined;
        const createTelegramAdapter = telegramAdapterModule.createTelegramAdapter as
          | ((input: Record<string, unknown>) => unknown)
          | undefined;

        if (!ChatCtor || !createTelegramAdapter) return null;

        return new ChatCtor({
          userName: "misgastosapp",
          adapters: {
            telegram: createTelegramAdapter({
              token: env.TELEGRAM_BOT_TOKEN,
              webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
            }),
          },
          streamingUpdateIntervalMs: 500,
        });
      } catch {
        return null;
      }
    })();
  }

  return cachedRuntime;
}

async function sendTelegramDirectMessage(input: {
  env: WorkerEnv;
  userId: string;
  text: string;
}): Promise<void> {
  const runtime = await getTelegramDmRuntime(input.env);
  if (runtime?.openDM) {
    const thread = await runtime.openDM(input.userId);
    await thread.post(input.text);
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${input.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: input.userId,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed (${response.status}): ${body}`);
  }
}

export function createTelegramChatSdkChannelAdapter(env: WorkerEnv): ChannelPort {
  return {
    async sendMessage(input: SendMessageInput): Promise<{ providerMessageId: string }> {
      await sendTelegramDirectMessage({
        env,
        userId: input.userId,
        text: input.text,
      });
      return { providerMessageId: `telegram:${input.userId}:${Date.now()}` };
    },
    async parseWebhook(_request: Request): Promise<IncomingUserMessage | null> {
      return null;
    },
    async verifyWebhook(_input: { headers: Headers; rawBody: string }): Promise<boolean> {
      return true;
    },
  };
}
