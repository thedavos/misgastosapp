export interface FeaturePolicyPort {
  isFeatureEnabled(input: { customerId: string; featureKey: string }): Promise<boolean>;
}
