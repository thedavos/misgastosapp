import type { WorkerEnv } from "types/env";

export async function handleTelegramWebhook(
  _request: Request,
  _env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  return new Response("Telegram webhook not implemented", { status: 501 });
}
