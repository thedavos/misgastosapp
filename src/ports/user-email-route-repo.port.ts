export interface UserEmailRouteRepoPort {
  resolveUserIdByRecipientEmail(recipientEmail: string): Promise<string | null>;
}
