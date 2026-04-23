import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import {
  AiExtractFailedError,
  ChannelDisabledError,
  ChannelPolicyError,
  FeaturePolicyError,
  AiMessageGenerationError,
  ChannelSendError,
  ConversationStateError,
  ExpensePersistenceError,
  InvalidTransactionError,
  SubscriptionFeatureBlockedError,
  type AppError,
} from "@/app/errors";
import { isValidExpenseCandidate } from "@/domain/expense/rules";
import type { AiPort } from "@/ports/ai.port";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";

export type CaptureExpenseWithClarificationInput = {
  customerId: string;
  sourceText: string;
  channel: string;
  externalUserId: string;
  requestId?: string;
};

export type CaptureExpenseWithClarificationDeps = {
  ai: AiPort;
  channel: ChannelPort;
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  expenseRepo: ExpenseRepoPort;
  conversationState: ConversationStatePort;
  logger: LoggerPort;
};

export function createCaptureExpenseWithClarification(deps: CaptureExpenseWithClarificationDeps) {
  return function captureExpenseWithClarification(
    input: CaptureExpenseWithClarificationInput,
  ): Effect.Effect<{ expenseId: string } | null, AppError> {
    return Effect.gen(function* () {
      const transaction = yield* fromPromise(
        () => deps.ai.extractTransaction(input.sourceText),
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
          deps.expenseRepo.createExpenseRecord({
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
            operation: "createExpenseRecord",
            cause,
          }),
      );

      yield* fromPromise(
        () =>
          deps.conversationState.put({
            userId: input.customerId,
            channel: input.channel,
            externalUserId: input.externalUserId,
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
          deps.channelPolicyRepo.isChannelEnabledForUser({
            userId: input.customerId,
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

      const featureKey = `channels.${input.channel}`;
      const featureEnabled = yield* fromPromise(
        () =>
          deps.featurePolicy.isFeatureEnabled({
            userId: input.customerId,
            featureKey,
          }),
        (cause) =>
          new FeaturePolicyError({
            requestId: input.requestId,
            featureKey,
            cause,
          }),
      );

      if (!featureEnabled) {
        deps.logger.warn("subscription.feature_blocked", {
          requestId: input.requestId,
          customerId: input.customerId,
          featureKey,
        });
        return yield* Effect.fail(
          new SubscriptionFeatureBlockedError({
            requestId: input.requestId,
            customerId: input.customerId,
            featureKey,
          }),
        );
      }

      yield* fromPromise(
        () => deps.channel.sendMessage({ externalUserId: input.externalUserId, text: message }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("expense.needs_clarification_created", {
        requestId: input.requestId,
        expenseId: expense.id,
        channel: input.channel,
        externalUserId: input.externalUserId,
      });

      return { expenseId: expense.id };
    });
  };
}
