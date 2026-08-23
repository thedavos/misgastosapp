export interface PendingConversationState {
  userId: string;
  channel: string;
  externalUserId: string;
  expenseId: string;
  createdAt: string;
}

export function buildConversationStateKey(
  userId: string,
  channel: string,
  externalUserId: string,
): string {
  return `conv:${userId}:${channel}:${externalUserId}`;
}
