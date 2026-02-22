import type { WorkerEnv } from "types/env";
import { buildConversationStateKey, type PendingConversationState } from "@/domain/conversation/entity";
import type { ConversationStatePort } from "@/ports/conversation-state.port";

const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

export function createKvConversationStateRepo(env: WorkerEnv): ConversationStatePort {
  return {
    async put(state: PendingConversationState): Promise<void> {
      const key = buildConversationStateKey(state.customerId, state.channel, state.userId);
      await env.CONVERSATION_STATE_KV.put(key, JSON.stringify(state), {
        expirationTtl: DEFAULT_TTL_SECONDS,
      });
    },

    async get(input: { customerId: string; channel: string; userId: string }): Promise<PendingConversationState | null> {
      const key = buildConversationStateKey(input.customerId, input.channel, input.userId);
      const payload = await env.CONVERSATION_STATE_KV.get(key);
      if (!payload) return null;

      try {
        return JSON.parse(payload) as PendingConversationState;
      } catch {
        return null;
      }
    },

    async delete(input: { customerId: string; channel: string; userId: string }): Promise<void> {
      const key = buildConversationStateKey(input.customerId, input.channel, input.userId);
      await env.CONVERSATION_STATE_KV.delete(key);
    },
  };
}
