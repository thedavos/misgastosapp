import type { CustomerSubscription, Plan } from "@/domain/subscription/entity";

export interface SubscriptionRepoPort {
  getEffectiveSubscription(customerId: string): Promise<CustomerSubscription | null>;
  getPlanById(planId: string): Promise<Plan | null>;
}
