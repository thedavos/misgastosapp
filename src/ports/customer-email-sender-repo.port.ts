export interface CustomerEmailSenderRepoPort {
  resolveCustomerIdBySenderEmail(senderEmail: string): Promise<string | null>;
}
