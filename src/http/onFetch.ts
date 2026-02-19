import type { WorkerEnv } from "types/env";

export async function onFetch(
  _request: Request,
  _env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  return new Response("MisGastos Worker Active - v1.0", {
    headers: { "Content-Type": "text/plain" },
  });
}
