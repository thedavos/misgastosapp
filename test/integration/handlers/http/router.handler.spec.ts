import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "test/helpers/fakes";

const healthSpy = vi.hoisted(() => vi.fn(async () => new Response("health", { status: 200 })));
const whatsappSpy = vi.hoisted(() => vi.fn(async () => new Response("wa", { status: 200 })));
const telegramSpy = vi.hoisted(() => vi.fn(async () => new Response("tg", { status: 501 })));
const instagramSpy = vi.hoisted(() => vi.fn(async () => new Response("ig", { status: 501 })));

vi.mock("@/handlers/http/health.handler", () => ({
  handleHealth: healthSpy,
}));

vi.mock("@/handlers/http/whatsapp-webhook.handler", () => ({
  handleWhatsAppWebhook: whatsappSpy,
}));

vi.mock("@/handlers/http/telegram-webhook.handler", () => ({
  handleTelegramWebhook: telegramSpy,
}));

vi.mock("@/handlers/http/instagram-webhook.handler", () => ({
  handleInstagramWebhook: instagramSpy,
}));

describe("router handler delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates GET /health to health handler", async () => {
    const { handleFetch } = await import("@/handlers/http/router.handler");
    const env = createTestEnv();

    const response = await handleFetch(new Request("https://example.com/health"), env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    expect(healthSpy).toHaveBeenCalledTimes(1);
    expect(whatsappSpy).not.toHaveBeenCalled();
    expect(telegramSpy).not.toHaveBeenCalled();
    expect(instagramSpy).not.toHaveBeenCalled();
  });

  it("delegates POST /webhooks/whatsapp to whatsapp handler", async () => {
    const { handleFetch } = await import("@/handlers/http/router.handler");
    const env = createTestEnv();

    const response = await handleFetch(
      new Request("https://example.com/webhooks/whatsapp", { method: "POST" }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(whatsappSpy).toHaveBeenCalledTimes(1);
    expect(healthSpy).not.toHaveBeenCalled();
    expect(telegramSpy).not.toHaveBeenCalled();
    expect(instagramSpy).not.toHaveBeenCalled();
  });
});
