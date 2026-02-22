import { Effect } from "effect";
import type { AiPort } from "@/ports/ai.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { LoggerPort } from "@/ports/logger.port";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import { isValidExpenseCandidate } from "@/domain/expense/rules";
import {
  AiExtractFailedError,
  ChannelDisabledError,
  ChannelPolicyError,
  AiMessageGenerationError,
  ChannelSendError,
  ConversationStateError,
  ExpensePersistenceError,
  InvalidTransactionError,
  type AppError,
} from "@/app/errors";
import { fromPromise } from "@/app/effects";

export type IngestExpenseFromEmailInput = {
  customerId: string;
  emailText: string;
  channel: string;
  userId: string;
  requestId?: string;
};

export type IngestExpenseFromEmailDeps = {
  ai: AiPort;
  channel: ChannelPort;
  channelPolicyRepo: ChannelPolicyRepoPort;
  expenseRepo: ExpenseRepoPort;
  conversationState: ConversationStatePort;
  logger: LoggerPort;
};

export function createIngestExpenseFromEmail(deps: IngestExpenseFromEmailDeps) {
  return function ingestExpenseFromEmail(
    input: IngestExpenseFromEmailInput,
  ): Effect.Effect<{ expenseId: string } | null, AppError> {
    return Effect.gen(function* () {
      const transaction = yield* fromPromise(
        () => deps.ai.extractTransaction(input.emailText),
        (cause) => new AiExtractFailedError({ requestId: input.requestId, cause }),
      );

      if (!transaction) {
        deps.logger.warn("email.ai_no_transaction", { requestId: input.requestId });
        return null;
      }

      if (!isValidExpenseCandidate(transaction)) {
        deps.logger.warn("email.invalid_transaction", { requestId: input.requestId, transaction });
        return yield* Effect.fail(new InvalidTransactionError({ requestId: input.requestId }));
      }

      const expense = yield* fromPromise(
        () =>
          deps.expenseRepo.createPending({
            customerId: input.customerId,
            amount: transaction.amount,
            currency: transaction.currency,
            merchant: transaction.merchant,
            occurredAt: transaction.date,
            bank: transaction.bank,
            rawText: transaction.rawText,
          }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "createPending",
            cause,
          }),
      );

      yield* fromPromise(
        () =>
          deps.conversationState.put({
            customerId: input.customerId,
            channel: input.channel,
            userId: input.userId,
            expenseId: expense.id,
            createdAt: new Date().toISOString(),
          }),
        (cause) =>
          new ConversationStateError({
            requestId: input.requestId,
            operation: "put",
            cause,
          }),
      );

      const message = yield* fromPromise(
        () =>
          deps.ai.generateMessage({
            kind: "ask_category",
            amount: expense.amount,
            currency: expense.currency,
            merchant: expense.merchant,
          }),
        (cause) => new AiMessageGenerationError({ requestId: input.requestId, cause }),
      );

      const isEnabled = yield* fromPromise(
        () =>
          deps.channelPolicyRepo.isChannelEnabledForCustomer({
            customerId: input.customerId,
            channelId: input.channel,
          }),
        (cause) =>
          new ChannelPolicyError({
            requestId: input.requestId,
            operation: "isEnabled",
            cause,
          }),
      );

      if (!isEnabled) {
        deps.logger.warn("channel.disabled_skip_send", {
          requestId: input.requestId,
          customerId: input.customerId,
          channelId: input.channel,
        });
        return yield* Effect.fail(
          new ChannelDisabledError({
            requestId: input.requestId,
            customerId: input.customerId,
            channelId: input.channel,
          }),
        );
      }

      yield* fromPromise(
        () => deps.channel.sendMessage({ userId: input.userId, text: message }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("expense.pending_category_created", {
        requestId: input.requestId,
        expenseId: expense.id,
        channel: input.channel,
        userId: input.userId,
      });

      return { expenseId: expense.id };
    });
  };
}
