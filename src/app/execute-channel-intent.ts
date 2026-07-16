import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import { ChannelSendError, type AppError } from "@/app/errors";
import { WHATSAPP_ONBOARDING_MESSAGE } from "@/app/onboarding";
import type {
  CreateExpenseIntentPayload,
  DeleteLastExpenseIntentPayload,
  GetReportIntentPayload,
  ParsedIntent,
  UpdateLastExpenseIntentPayload,
} from "@/domain/intent/entity";
import type { ChannelPort } from "@/ports/channel.port";

export type ExecuteChannelIntentDeps = {
  channel?: ChannelPort;
  createExpenseFromIntent?: (input: {
    userId: string;
    channel: string;
    sourceType?: "whatsapp" | "email" | "mobile" | "telegram";
    externalUserId: string;
    payload: CreateExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ expenseId: string } | null, AppError>;
  updateLastExpenseFromIntent?: (input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: UpdateLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  deleteLastExpenseFromIntent?: (input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: DeleteLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  getReportFromIntent?: (input: {
    userId: string;
    channel: string;
    externalUserId: string;
    payload: GetReportIntentPayload;
    timezone: string;
    nowIso: string;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean }, AppError>;
};

export function canApplyUpdateIntentDirectly(payload: UpdateLastExpenseIntentPayload): boolean {
  return payload.confidence >= 0.9 && payload.patch.amountMinor !== undefined;
}

export function canApplyDeleteIntentDirectly(payload: DeleteLastExpenseIntentPayload): boolean {
  return payload.confidence >= 0.9;
}

export function canApplyReportIntentDirectly(payload: GetReportIntentPayload): boolean {
  return payload.confidence >= 0.9;
}

export function createExecuteChannelIntent(deps: ExecuteChannelIntentDeps) {
  return function executeChannelIntent(input: {
    userId: string;
    channel: string;
    sourceType?: "whatsapp" | "email" | "mobile" | "telegram";
    externalUserId: string;
    parsedIntent: ParsedIntent;
    timezone: string;
    nowIso: string;
    requestId?: string;
  }): Effect.Effect<{ handled: boolean; expenseId?: string }, AppError> {
    return Effect.gen(function* () {
      if (input.parsedIntent.name === "create_expense" && deps.createExpenseFromIntent) {
        const created = yield* deps.createExpenseFromIntent({
          userId: input.userId,
          channel: input.channel,
          sourceType: input.sourceType,
          externalUserId: input.externalUserId,
          payload: input.parsedIntent.payload,
          requestId: input.requestId,
        });

        if (created?.expenseId) {
          return { handled: true, expenseId: created.expenseId };
        }
      }

      if (
        input.parsedIntent.name === "update_last_expense" &&
        deps.updateLastExpenseFromIntent &&
        canApplyUpdateIntentDirectly(input.parsedIntent.payload)
      ) {
        const updated = yield* deps.updateLastExpenseFromIntent({
          userId: input.userId,
          channel: input.channel,
          externalUserId: input.externalUserId,
          payload: input.parsedIntent.payload,
          requestId: input.requestId,
        });

        if (updated.handled) {
          return { handled: true, expenseId: updated.expenseId };
        }
      }

      if (
        input.parsedIntent.name === "delete_last_expense" &&
        deps.deleteLastExpenseFromIntent &&
        canApplyDeleteIntentDirectly(input.parsedIntent.payload)
      ) {
        const deleted = yield* deps.deleteLastExpenseFromIntent({
          userId: input.userId,
          channel: input.channel,
          externalUserId: input.externalUserId,
          payload: input.parsedIntent.payload,
          requestId: input.requestId,
        });

        if (deleted.handled) {
          return { handled: true, expenseId: deleted.expenseId };
        }
      }

      if (
        input.parsedIntent.name === "get_report" &&
        deps.getReportFromIntent &&
        canApplyReportIntentDirectly(input.parsedIntent.payload)
      ) {
        const reported = yield* deps.getReportFromIntent({
          userId: input.userId,
          channel: input.channel,
          externalUserId: input.externalUserId,
          payload: input.parsedIntent.payload,
          timezone: input.timezone,
          nowIso: input.nowIso,
          requestId: input.requestId,
        });

        if (reported.handled) {
          return { handled: true };
        }
      }

      if (input.parsedIntent.name === "help" && deps.channel) {
        yield* fromPromise(
          () =>
            deps.channel!.sendMessage({
              externalUserId: input.externalUserId,
              text: WHATSAPP_ONBOARDING_MESSAGE,
            }),
          (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
        );
        return { handled: true };
      }

      return { handled: false };
    });
  };
}
