export interface FeaturePolicyPort {
  isFeatureEnabled(input: { userId: string; featureKey: string }): Promise<boolean>;
}
