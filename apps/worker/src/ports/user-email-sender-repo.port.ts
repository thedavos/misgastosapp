export interface UserEmailSenderRepoPort {
  resolveUserIdBySenderEmail(senderEmail: string): Promise<string | null>;
}
