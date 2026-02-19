import type { WorkerEnv } from "types/env";
import { createLogger } from "@/logger";

export async function onFetch(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const requestId = request.headers.get("cf-ray") ?? undefined;
  const logger = createLogger({ env: env.ENVIRONMENT, requestId });

  logger.info("http.request", {
    method: request.method,
    url: request.url,
  });

  return new Response("MisGastos Worker Active - v1.0", {
    headers: { "Content-Type": "text/plain" },
  });
}
