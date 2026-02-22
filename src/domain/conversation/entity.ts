export interface PendingConversationState {
  customerId: string;
  channel: string;
  userId: string;
  expenseId: string;
  createdAt: string;
}

export function buildConversationStateKey(customerId: string, channel: string, userId: string): string {
  return `conv:${customerId}:${channel}:${userId}`;
}
