import type { UserSubscription, Plan } from "@/domain/subscription/entity";

export interface SubscriptionRepoPort {
  getEffectiveSubscription(userId: string): Promise<UserSubscription | null>;
  getPlanById(planId: string): Promise<Plan | null>;
}
