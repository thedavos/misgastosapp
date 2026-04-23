import type { WorkerEnv } from "types/env";
import {
  buildConversationStateKey,
  type PendingConversationState,
} from "@/domain/conversation/entity";
import type { ConversationStatePort } from "@/ports/conversation-state.port";

const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

export function createKvConversationStateRepo(env: WorkerEnv): ConversationStatePort {
  return {
    async put(state: PendingConversationState): Promise<void> {
      const key = buildConversationStateKey(state.userId, state.channel, state.externalUserId);
      await env.CONVERSATION_STATE_KV.put(key, JSON.stringify(state), {
        expirationTtl: DEFAULT_TTL_SECONDS,
      });
    },

    async get(input: {
      userId: string;
      channel: string;
      externalUserId: string;
    }): Promise<PendingConversationState | null> {
      const key = buildConversationStateKey(input.userId, input.channel, input.externalUserId);
      const payload = await env.CONVERSATION_STATE_KV.get(key);
      if (!payload) return null;

      try {
        return JSON.parse(payload) as PendingConversationState;
      } catch {
        return null;
      }
    },

    async delete(input: {
      userId: string;
      channel: string;
      externalUserId: string;
    }): Promise<void> {
      const key = buildConversationStateKey(input.userId, input.channel, input.externalUserId);
      await env.CONVERSATION_STATE_KV.delete(key);
    },
  };
}
