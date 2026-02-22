export interface Customer {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  defaultCurrency: string;
  timezone: string;
  locale: string;
  confidenceThreshold: number;
}

export interface CustomerChannel {
  id: string;
  customerId: string;
  channel: string;
  externalUserId: string;
  isPrimary: boolean;
}
