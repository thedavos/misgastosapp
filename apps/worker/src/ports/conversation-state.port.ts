import type { PendingConversationState } from "@/domain/conversation/entity";

export interface ConversationStatePort {
  put(state: PendingConversationState): Promise<void>;
  get(input: {
    userId: string;
    channel: string;
    externalUserId: string;
  }): Promise<PendingConversationState | null>;
  delete(input: { userId: string; channel: string; externalUserId: string }): Promise<void>;
}
