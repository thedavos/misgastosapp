export interface PendingConversationState {
  channel: string;
  userId: string;
  expenseId: string;
  createdAt: string;
}

export function buildConversationStateKey(channel: string, userId: string): string {
  return `conv:${channel}:${userId}`;
}
