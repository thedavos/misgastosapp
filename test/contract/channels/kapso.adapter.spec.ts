import { describe, expect, it } from "vitest";
import { createKapsoChannelAdapter } from "@/adapters/channels/whatsapp/kapso.adapter";
import { createTestEnv } from "test/helpers/fakes";

async function hmacSignature(secret: string, timestamp: number, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${timestamp}.${rawBody}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `v1=${hex}`;
}

describe("kapso adapter contract", () => {
  it("normalizes webhook payload and resolves provider event id", async () => {
    const env = createTestEnv();
    const channel = createKapsoChannelAdapter(env);

    const request = new Request("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "evt_123",
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
        providerEventId: "evt_123",
      }),
    );
    expect(message?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses deterministic hash fallback for event id", async () => {
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
    expect(message?.providerEventId).toMatch(/^hash:[0-9a-f]{64}$/);
  });

  it("accepts valid HMAC signature with current timestamp", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const channel = createKapsoChannelAdapter(env);

    const body = JSON.stringify({ id: "evt_1", from: "51999999999", text: "hola" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await hmacSignature("topsecret", timestamp, body);

    const isValid = await channel.verifyWebhook({
      headers: new Headers({
        "x-kapso-signature": signature,
        "x-kapso-timestamp": String(timestamp),
      }),
      rawBody: body,
    });

    expect(isValid).toBe(true);
  });

  it("rejects expired timestamp", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
      kapsoWebhookMaxSkewSeconds: "300",
    });
    const channel = createKapsoChannelAdapter(env);

    const body = JSON.stringify({ id: "evt_1", from: "51999999999", text: "hola" });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const signature = await hmacSignature("topsecret", oldTimestamp, body);

    const isValid = await channel.verifyWebhook({
      headers: new Headers({
        "x-kapso-signature": signature,
        "x-kapso-timestamp": String(oldTimestamp),
      }),
      rawBody: body,
    });

    expect(isValid).toBe(false);
  });

  it("rejects invalid signature", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const channel = createKapsoChannelAdapter(env);

    const body = JSON.stringify({ id: "evt_1", from: "51999999999", text: "hola" });
    const timestamp = Math.floor(Date.now() / 1000);

    const isValid = await channel.verifyWebhook({
      headers: new Headers({
        "x-kapso-signature": "v1=deadbeef",
        "x-kapso-timestamp": String(timestamp),
      }),
      rawBody: body,
    });

    expect(isValid).toBe(false);
  });

  it("allows legacy signature in dual mode", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "dual",
    });
    const channel = createKapsoChannelAdapter(env);

    const body = JSON.stringify({ id: "evt_1", from: "51999999999", text: "hola" });

    const isValid = await channel.verifyWebhook({
      headers: new Headers({
        "x-kapso-signature": "topsecret",
      }),
      rawBody: body,
    });

    expect(isValid).toBe(true);
  });

  it("rejects legacy signature in strict mode", async () => {
    const env = createTestEnv({
      kapsoWebhookSecret: "topsecret",
      kapsoWebhookSignatureMode: "strict",
    });
    const channel = createKapsoChannelAdapter(env);

    const body = JSON.stringify({ id: "evt_1", from: "51999999999", text: "hola" });

    const isValid = await channel.verifyWebhook({
      headers: new Headers({
        "x-kapso-signature": "topsecret",
      }),
      rawBody: body,
    });

    expect(isValid).toBe(false);
  });
});
