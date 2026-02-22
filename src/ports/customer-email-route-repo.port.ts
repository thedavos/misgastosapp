export interface CustomerEmailRouteRepoPort {
  resolveCustomerIdByRecipientEmail(recipientEmail: string): Promise<string | null>;
}
