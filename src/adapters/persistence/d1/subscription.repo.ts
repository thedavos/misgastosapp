import type { WorkerEnv } from "types/env";
import type { CustomerSubscription, Plan } from "@/domain/subscription/entity";
import type { SubscriptionRepoPort } from "@/ports/subscription-repo.port";

type SubscriptionRow = {
  id: string;
  customer_id: string;
  plan_id: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  start_at: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  provider: string;
  provider_subscription_id: string | null;
  plan_version_at_start: number;
  metadata_json: string | null;
};

type PlanRow = {
  id: string;
  name: string;
  price_amount: number;
  price_currency: string;
  billing_interval: "monthly" | "yearly" | "none";
  status: "ACTIVE" | "INACTIVE";
  version: number;
};

function mapSubscription(row: SubscriptionRow): CustomerSubscription {
  return {
    id: row.id,
    customerId: row.customer_id,
    planId: row.plan_id,
    status: row.status,
    startAt: row.start_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    planVersionAtStart: row.plan_version_at_start,
    metadataJson: row.metadata_json,
  };
}

function mapPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    billingInterval: row.billing_interval,
    status: row.status,
    version: row.version,
  };
}

export function createD1SubscriptionRepo(env: WorkerEnv): SubscriptionRepoPort {
  return {
    async getEffectiveSubscription(customerId: string): Promise<CustomerSubscription | null> {
      const row = await env.DB.prepare(
        `SELECT id, customer_id, plan_id, status, start_at, current_period_start, current_period_end,
                cancel_at_period_end, provider, provider_subscription_id, plan_version_at_start, metadata_json
         FROM customer_subscriptions
         WHERE customer_id = ? AND status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
         ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'TRIALING' THEN 1 ELSE 2 END ASC,
                  current_period_end DESC
         LIMIT 1`,
      )
        .bind(customerId)
        .first<SubscriptionRow>();

      if (!row) return null;
      return mapSubscription(row);
    },

    async getPlanById(planId: string): Promise<Plan | null> {
      const row = await env.DB.prepare(
        `SELECT id, name, price_amount, price_currency, billing_interval, status, version
         FROM plans
         WHERE id = ?
         LIMIT 1`,
      )
        .bind(planId)
        .first<PlanRow>();

      if (!row) return null;
      return mapPlan(row);
    },
  };
}
