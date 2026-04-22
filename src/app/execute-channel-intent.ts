import { Effect } from "effect";
import type {
  CreateExpenseIntentPayload,
  DeleteLastExpenseIntentPayload,
  GetReportIntentPayload,
  ParsedIntent,
  UpdateLastExpenseIntentPayload,
} from "@/domain/intent/entity";
import type { AppError } from "@/app/errors";

export type ExecuteChannelIntentDeps = {
  createExpenseFromIntent?: (input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: CreateExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ expenseId: string } | null, AppError>;
  updateLastExpenseFromIntent?: (input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: UpdateLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  deleteLastExpenseFromIntent?: (input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: DeleteLastExpenseIntentPayload;
    requestId?: string;
  }) => Effect.Effect<{ handled: boolean; expenseId?: string }, AppError>;
  getReportFromIntent?: (input: {
    customerId: string;
    channel: string;
    userId: string;
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
    customerId: string;
    channel: string;
    userId: string;
    parsedIntent: ParsedIntent;
    timezone: string;
    nowIso: string;
    requestId?: string;
  }): Effect.Effect<{ handled: boolean; expenseId?: string }, AppError> {
    return Effect.gen(function* () {
      if (input.parsedIntent.name === "create_expense" && deps.createExpenseFromIntent) {
        const created = yield* deps.createExpenseFromIntent({
          customerId: input.customerId,
          channel: input.channel,
          userId: input.userId,
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
          customerId: input.customerId,
          channel: input.channel,
          userId: input.userId,
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
          customerId: input.customerId,
          channel: input.channel,
          userId: input.userId,
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
          customerId: input.customerId,
          channel: input.channel,
          userId: input.userId,
          payload: input.parsedIntent.payload,
          timezone: input.timezone,
          nowIso: input.nowIso,
          requestId: input.requestId,
        });

        if (reported.handled) {
          return { handled: true };
        }
      }

      return { handled: false };
    });
  };
}
