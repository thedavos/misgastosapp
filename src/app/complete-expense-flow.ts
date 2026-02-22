import { Effect } from "effect";
import type { AiPort } from "@/ports/ai.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { LoggerPort } from "@/ports/logger.port";
import { AiMessageGenerationError, ChannelSendError, ConversationStateError, type AppError } from "@/app/errors";
import { fromPromise } from "@/app/effects";

export type CompleteExpenseFlowDeps = {
  ai: AiPort;
  channel: ChannelPort;
  conversationState: ConversationStatePort;
  logger: LoggerPort;
};

export function createCompleteExpenseFlow(deps: CompleteExpenseFlowDeps) {
  return function completeExpenseFlow(input: {
    channel: string;
    userId: string;
    categoryName: string;
    requestId?: string;
  }): Effect.Effect<void, AppError> {
    return Effect.gen(function* () {
      yield* fromPromise(
        () => deps.conversationState.delete({ channel: input.channel, userId: input.userId }),
        (cause) =>
          new ConversationStateError({
            requestId: input.requestId,
            operation: "delete",
            cause,
          }),
      );

      const message = yield* fromPromise(
        () =>
          deps.ai.generateMessage({
            kind: "confirmation",
            categoryName: input.categoryName,
          }),
        (cause) => new AiMessageGenerationError({ requestId: input.requestId, cause }),
      );

      yield* fromPromise(
        () => deps.channel.sendMessage({ userId: input.userId, text: message }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("expense.flow_completed", {
        requestId: input.requestId,
        channel: input.channel,
        userId: input.userId,
        categoryName: input.categoryName,
      });
    });
  };
}
