import type { PendingConversationState } from "@/domain/conversation/entity";

export interface ConversationStatePort {
  put(state: PendingConversationState): Promise<void>;
  get(input: { channel: string; userId: string }): Promise<PendingConversationState | null>;
  delete(input: { channel: string; userId: string }): Promise<void>;
}
