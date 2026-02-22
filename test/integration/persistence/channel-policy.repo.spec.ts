import { describe, expect, it } from "vitest";
import { createD1ChannelPolicyRepo } from "@/adapters/persistence/d1/channel-policy.repo";
import { createTestEnv } from "test/helpers/fakes";

describe("d1 channel policy repo integration", () => {
  it("returns true when global channel and customer setting are enabled", async () => {
    const env = createTestEnv();
    const repo = createD1ChannelPolicyRepo(env);

    const enabled = await repo.isChannelEnabledForCustomer({
      customerId: "cust_default",
      channelId: "whatsapp",
    });

    expect(enabled).toBe(true);
  });

  it("returns false when global channel is inactive", async () => {
    const env = createTestEnv({
      channels: [
        { id: "whatsapp", name: "WhatsApp", status: "INACTIVE" },
        { id: "telegram", name: "Telegram", status: "INACTIVE" },
        { id: "instagram", name: "Instagram", status: "INACTIVE" },
      ],
    });
    const repo = createD1ChannelPolicyRepo(env);

    const enabled = await repo.isChannelEnabledForCustomer({
      customerId: "cust_default",
      channelId: "whatsapp",
    });

    expect(enabled).toBe(false);
  });

  it("returns false in strict mode when customer channel setting is missing", async () => {
    const env = createTestEnv({
      channelSettings: [],
      strictPolicyMode: "true",
    });
    const repo = createD1ChannelPolicyRepo(env);

    const enabled = await repo.isChannelEnabledForCustomer({
      customerId: "cust_default",
      channelId: "whatsapp",
    });

    expect(enabled).toBe(false);
  });

  it("returns true in compatibility mode when customer channel setting is missing", async () => {
    const env = createTestEnv({
      channelSettings: [],
      strictPolicyMode: "false",
    });
    const repo = createD1ChannelPolicyRepo(env);

    const enabled = await repo.isChannelEnabledForCustomer({
      customerId: "cust_default",
      channelId: "whatsapp",
    });

    expect(enabled).toBe(true);
  });
});
