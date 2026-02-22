import { Hono } from "hono";
import type { WorkerEnv } from "types/env";
import { handleHealth } from "@/handlers/http/health.handler";
import { handleInstagramWebhook } from "@/handlers/http/instagram-webhook.handler";
import { handleTelegramWebhook } from "@/handlers/http/telegram-webhook.handler";
import { handleWhatsAppWebhook } from "@/handlers/http/whatsapp-webhook.handler";

type AppBindings = {
  Bindings: WorkerEnv;
};

export const app = new Hono<AppBindings>();

app.get("/health", (c) => handleHealth(c.req.raw, c.env, c.executionCtx));
app.post("/webhooks/whatsapp", (c) => handleWhatsAppWebhook(c.req.raw, c.env, c.executionCtx));
app.post("/webhooks/telegram", (c) => handleTelegramWebhook(c.req.raw, c.env, c.executionCtx));
app.post("/webhooks/instagram", (c) => handleInstagramWebhook(c.req.raw, c.env, c.executionCtx));
app.get("/webhooks/whatsapp", () => new Response("Method Not Allowed", { status: 405 }));
app.get("/webhooks/telegram", () => new Response("Method Not Allowed", { status: 405 }));
app.get("/webhooks/instagram", () => new Response("Method Not Allowed", { status: 405 }));
app.notFound(() => new Response("Not Found", { status: 404 }));

export async function handleFetch(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  return app.fetch(request, env, ctx);
}
