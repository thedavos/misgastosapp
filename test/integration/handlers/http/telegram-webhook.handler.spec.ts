import { describe, expect, it } from "vitest";
import { handleTelegramWebhook } from "@/handlers/http/telegram-webhook.handler";
import { createTestEnv } from "test/helpers/fakes";

describe("telegram webhook handler integration", () => {
  it("returns 501 when chat sdk packages are not available in runtime", async () => {
    const env = createTestEnv();

    const request = new Request("https://example.com/webhooks/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        update_id: 1,
      }),
    });

    const response = await handleTelegramWebhook(request, env, {} as ExecutionContext);
    expect(response.status).toBe(501);
  });
});
