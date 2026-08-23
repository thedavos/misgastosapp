import type { WorkerEnv } from "types/env";
import { handleTelegramWebhookWithChatSdk } from "@/adapters/channels/telegram/chat-sdk.bot";

export async function handleTelegramWebhook(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  return handleTelegramWebhookWithChatSdk(request, env, ctx);
}
