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
import { DEFAULT_CATEGORIES } from "@/domain/category/defaults";
import { isValidExpenseCandidate } from "@/domain/expense/rules";
import type { AiPort } from "@/ports/ai.port";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ConversationStatePort } from "@/ports/conversation-state.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";

export type CaptureExpenseWithClarificationInput = {
  userId: string;
  sourceText: string;
  channel: string;
  createdVia?: "whatsapp" | "email" | "mobile" | "telegram";
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

      const isEnabled = yield* fromPromise(
        () =>
          deps.channelPolicyRepo.isChannelEnabledForUser({
            userId: input.userId,
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
          userId: input.userId,
          channelId: input.channel,
        });
        return yield* Effect.fail(
          new ChannelDisabledError({
            requestId: input.requestId,
            userId: input.userId,
            channelId: input.channel,
          }),
        );
      }

      const featureKey = `channels.${input.channel}`;
      const featureEnabled = yield* fromPromise(
        () =>
          deps.featurePolicy.isFeatureEnabled({
            userId: input.userId,
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
          userId: input.userId,
          featureKey,
        });
        return yield* Effect.fail(
          new SubscriptionFeatureBlockedError({
            requestId: input.requestId,
            userId: input.userId,
            featureKey,
          }),
        );
      }

      const expense = yield* fromPromise(
        () =>
          deps.expenseRepo.createExpenseRecord({
            userId: input.userId,
            amount: transaction.amount,
            currency: transaction.currency,
            merchant: transaction.merchant,
            occurredAt: transaction.date,
            bank: transaction.bank,
            rawText: transaction.rawText,
            createdVia:
              input.createdVia ?? (input.channel as "whatsapp" | "email" | "mobile" | "telegram"),
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
            userId: input.userId,
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
            categories: [...DEFAULT_CATEGORIES],
          }),
        (cause) => new AiMessageGenerationError({ requestId: input.requestId, cause }),
      );

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
