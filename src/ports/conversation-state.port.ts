import type { PendingConversationState } from "@/domain/conversation/entity";

export interface ConversationStatePort {
  put(state: PendingConversationState): Promise<void>;
  get(input: { customerId: string; channel: string; userId: string }): Promise<PendingConversationState | null>;
  delete(input: { customerId: string; channel: string; userId: string }): Promise<void>;
}
