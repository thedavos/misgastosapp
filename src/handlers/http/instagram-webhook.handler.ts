import type { WorkerEnv } from "types/env";

export async function handleInstagramWebhook(
  _request: Request,
  _env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  return new Response("Instagram webhook not implemented", { status: 501 });
}
