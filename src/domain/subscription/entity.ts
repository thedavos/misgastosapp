export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

export interface Plan {
  id: string;
  name: string;
  priceAmount: number;
  priceCurrency: string;
  billingInterval: "monthly" | "yearly" | "none";
  status: "ACTIVE" | "INACTIVE";
  version: number;
}

export interface CustomerSubscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  startAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  provider: string;
  providerSubscriptionId: string | null;
  planVersionAtStart: number;
  metadataJson: string | null;
}
