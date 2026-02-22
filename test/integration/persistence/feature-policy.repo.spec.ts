import { describe, expect, it } from "vitest";
import { createD1FeaturePolicyRepo } from "@/adapters/persistence/d1/feature-policy.repo";
import { createD1SubscriptionRepo } from "@/adapters/persistence/d1/subscription.repo";
import { createTestEnv } from "test/helpers/fakes";

describe("d1 feature policy repo integration", () => {
  it("falls back to free plan when no active subscription is found", async () => {
    const env = createTestEnv({ subscriptions: [] });
    const subscriptionRepo = createD1SubscriptionRepo(env);
    const featureRepo = createD1FeaturePolicyRepo(env, subscriptionRepo);

    const whatsappEnabled = await featureRepo.isFeatureEnabled({
      customerId: "cust_default",
      featureKey: "channels.whatsapp",
    });

    const telegramEnabled = await featureRepo.isFeatureEnabled({
      customerId: "cust_default",
      featureKey: "channels.telegram",
    });

    expect(whatsappEnabled).toBe(true);
    expect(telegramEnabled).toBe(false);
  });

  it("degrades to free when effective plan is inactive", async () => {
    const env = createTestEnv({
      plans: [
        {
          id: "free",
          name: "Free",
          price_amount: 0,
          price_currency: "PEN",
          billing_interval: "none",
          status: "ACTIVE",
          version: 1,
        },
        {
          id: "pro",
          name: "Pro",
          price_amount: 1990,
          price_currency: "PEN",
          billing_interval: "monthly",
          status: "INACTIVE",
          version: 1,
        },
      ],
      subscriptions: [
        {
          id: "sub_cust_default_pro",
          customer_id: "cust_default",
          plan_id: "pro",
          status: "ACTIVE",
          start_at: "2026-01-01T00:00:00.000Z",
          current_period_start: "2026-01-01T00:00:00.000Z",
          current_period_end: "9999-12-31T23:59:59.000Z",
          cancel_at_period_end: 0,
          provider: "manual",
          provider_subscription_id: null,
          plan_version_at_start: 1,
          metadata_json: null,
        },
      ],
    });

    const subscriptionRepo = createD1SubscriptionRepo(env);
    const featureRepo = createD1FeaturePolicyRepo(env, subscriptionRepo);

    const telegramEnabled = await featureRepo.isFeatureEnabled({
      customerId: "cust_default",
      featureKey: "channels.telegram",
    });

    expect(telegramEnabled).toBe(false);
  });
});
