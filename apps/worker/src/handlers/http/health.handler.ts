import type { WorkerEnv } from "types/env";
import { createContainer } from "@/composition/container";

export async function handleHealth(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const requestId = request.headers.get("cf-ray") ?? undefined;
  const container = createContainer(env, requestId);

  container.logger.info("http.health", {
    method: request.method,
    url: request.url,
  });

  return new Response("MisGastos Worker Active - v2.0", {
    headers: { "Content-Type": "text/plain" },
  });
}
