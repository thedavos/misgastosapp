import { describe, expect, it } from "vitest";
import { createKapsoChannelAdapter } from "@/adapters/channels/whatsapp/kapso.adapter";
import { createTestEnv } from "test/helpers/fakes";

describe("kapso adapter contract", () => {
  it("normalizes webhook payload to IncomingUserMessage", async () => {
    const env = createTestEnv();
    const channel = createKapsoChannelAdapter(env);

    const request = new Request("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "51999999999",
        text: "comida",
        timestamp: 1739980000,
      }),
    });

    const message = await channel.parseWebhook(request);

    expect(message).toEqual(
      expect.objectContaining({
        channel: "whatsapp",
        userId: "51999999999",
        text: "comida",
      }),
    );
  });
});
