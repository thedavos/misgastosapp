export interface User {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  defaultCurrency: string;
  timezone: string;
  locale: string;
  confidenceThreshold: number;
  onboardingCompletedAt: string | null;
}

export interface UserSource {
  id: string;
  userId: string;
  channel: string;
  externalUserId: string;
  isPrimary: boolean;
}
