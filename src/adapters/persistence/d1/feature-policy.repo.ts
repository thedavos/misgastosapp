import type { WorkerEnv } from "types/env";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { SubscriptionRepoPort } from "@/ports/subscription-repo.port";

type PlanFeatureRow = {
  feature_type: "boolean" | "limit";
  bool_value: number | null;
  limit_value: number | null;
};

const ENTITLEMENT_TTL_SECONDS = 60 * 5;

export function createD1FeaturePolicyRepo(env: WorkerEnv, subscriptionRepo: SubscriptionRepoPort): FeaturePolicyPort {
  return {
    async isFeatureEnabled(input: { customerId: string; featureKey: string }): Promise<boolean> {
      const cacheKey = `entitlement:${input.customerId}:${input.featureKey}`;
      const cached = env.ENTITLEMENTS_KV ? await env.ENTITLEMENTS_KV.get(cacheKey) : null;
      if (cached === "1") return true;
      if (cached === "0") return false;

      const subscription = await subscriptionRepo.getEffectiveSubscription(input.customerId);

      let effectivePlanId = subscription?.planId ?? "free";
      let plan = await subscriptionRepo.getPlanById(effectivePlanId);

      if (!plan || plan.status !== "ACTIVE") {
        effectivePlanId = "free";
        plan = await subscriptionRepo.getPlanById("free");
      }

      if (!plan) {
        return false;
      }

      const feature = await env.DB.prepare(
        `SELECT feature_type, bool_value, limit_value
         FROM plan_features
         WHERE plan_id = ? AND feature_key = ?
         LIMIT 1`,
      )
        .bind(effectivePlanId, input.featureKey)
        .first<PlanFeatureRow>();

      const enabled = feature?.feature_type === "boolean" ? feature.bool_value === 1 : (feature?.limit_value ?? 0) > 0;

      if (env.ENTITLEMENTS_KV) {
        await env.ENTITLEMENTS_KV.put(cacheKey, enabled ? "1" : "0", {
          expirationTtl: ENTITLEMENT_TTL_SECONDS,
        });
      }

      return enabled;
    },
  };
}
