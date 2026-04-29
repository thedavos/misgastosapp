import { buildPeriodExpenses, buildPeriodSummary, buildTopSpendSummary } from "@/app/report-summary";
import type { Expense } from "@/domain/expense/entity";
import type { ParsedIntent } from "@/domain/intent/entity";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";

export type ExecuteMobileIntentDeps = {
  parseUserIntent: (input: {
    text: string;
    context: {
      sourceType: "mobile";
      timezone: string;
      defaultCurrency: string;
      nowIso: string;
    };
    requestId?: string;
  }) => Promise<ParsedIntent>;
  expenseRepo: ExpenseRepoPort;
};

export type ExecuteMobileIntentInput = {
  userId: string;
  text: string;
  timezone: string;
  defaultCurrency: string;
  nowIso: string;
  requestId?: string;
};

export type MobileIntentExecutionResult =
  | {
      handled: true;
      sourceType: "mobile";
      parsedIntent: ParsedIntent;
      result:
        | {
            kind: "expense_created";
            expense: Expense;
          }
        | {
            kind: "expense_updated";
            expense: Expense | null;
          }
        | {
            kind: "expense_deleted";
            expense: Expense | null;
          }
        | {
            kind: "no_latest_expense";
            message: string;
          }
        | {
            kind: "report_generated";
            summary: string;
            expenses: Expense[];
          };
    }
  | {
      handled: false;
      sourceType: "mobile";
      parsedIntent: ParsedIntent;
      error: "intent_not_executable";
    };

function canApplyCreateIntentDirectly(intent: ParsedIntent): intent is Extract<ParsedIntent, { name: "create_expense" }> {
  return (
    intent.name === "create_expense" &&
    intent.payload.confidence >= 0.85 &&
    intent.payload.missingFields.length === 0 &&
    intent.payload.draft.amountMinor !== undefined &&
    Boolean(intent.payload.draft.currency) &&
    Boolean(intent.payload.draft.merchant) &&
    Boolean(intent.payload.draft.occurredAt)
  );
}

function canApplyUpdateIntentDirectly(intent: ParsedIntent): intent is Extract<ParsedIntent, { name: "update_last_expense" }> {
  return (
    intent.name === "update_last_expense" &&
    intent.payload.confidence >= 0.9 &&
    intent.payload.patch.amountMinor !== undefined
  );
}

function canApplyDeleteIntentDirectly(intent: ParsedIntent): intent is Extract<ParsedIntent, { name: "delete_last_expense" }> {
  return intent.name === "delete_last_expense" && intent.payload.confidence >= 0.9;
}

function canApplyReportIntentDirectly(intent: ParsedIntent): intent is Extract<ParsedIntent, { name: "get_report" }> {
  return intent.name === "get_report" && intent.payload.confidence >= 0.9;
}

export function createExecuteMobileIntent(deps: ExecuteMobileIntentDeps) {
  return async function executeMobileIntent(
    input: ExecuteMobileIntentInput,
  ): Promise<MobileIntentExecutionResult> {
    const parsedIntent = await deps.parseUserIntent({
      text: input.text,
      context: {
        sourceType: "mobile",
        timezone: input.timezone,
        defaultCurrency: input.defaultCurrency,
        nowIso: input.nowIso,
      },
      requestId: input.requestId,
    });

    if (canApplyCreateIntentDirectly(parsedIntent)) {
      const created = await deps.expenseRepo.createExpenseRecord({
        userId: input.userId,
        amount: parsedIntent.payload.draft.amountMinor! / 100,
        currency: parsedIntent.payload.draft.currency!,
        merchant: parsedIntent.payload.draft.merchant!,
        occurredAt: parsedIntent.payload.draft.occurredAt!,
        bank: "mobile",
        rawText: parsedIntent.payload.draft.description ?? input.text,
        createdVia: "mobile",
      });

      return {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "expense_created",
          expense: created,
        },
      };
    }

    if (canApplyUpdateIntentDirectly(parsedIntent)) {
      const latestExpense = await deps.expenseRepo.findLatestByUser({
        userId: input.userId,
      });

      if (!latestExpense) {
        return {
          handled: true,
          sourceType: "mobile",
          parsedIntent,
          result: {
            kind: "no_latest_expense",
            message: "No encontré un gasto reciente para corregir.",
          },
        };
      }

      const updated = await deps.expenseRepo.update({
        id: latestExpense.id,
        userId: input.userId,
        amount: parsedIntent.payload.patch.amountMinor! / 100,
        currency: parsedIntent.payload.patch.currency ?? latestExpense.currency,
        merchant: parsedIntent.payload.patch.merchant ?? latestExpense.merchant,
        occurredAt: parsedIntent.payload.patch.occurredAt ?? latestExpense.occurredAt,
        rawText: latestExpense.rawText,
      });

      return {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "expense_updated",
          expense: updated,
        },
      };
    }

    if (canApplyDeleteIntentDirectly(parsedIntent)) {
      const latestExpense = await deps.expenseRepo.findLatestByUser({
        userId: input.userId,
      });

      if (!latestExpense) {
        return {
          handled: true,
          sourceType: "mobile",
          parsedIntent,
          result: {
            kind: "no_latest_expense",
            message: "No encontré un gasto reciente para eliminar.",
          },
        };
      }

      const discarded = await deps.expenseRepo.discard({
        id: latestExpense.id,
        userId: input.userId,
      });

      return {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "expense_deleted",
          expense: discarded,
        },
      };
    }

    if (canApplyReportIntentDirectly(parsedIntent)) {
      const expenses = await deps.expenseRepo.listByUser({ userId: input.userId });
      const periodExpenses = buildPeriodExpenses({
        expenses,
        nowIso: input.nowIso,
        timezone: input.timezone,
        periodKind: parsedIntent.payload.periodKind,
      });

      const summary =
        parsedIntent.payload.periodKind === "top_spend"
          ? buildTopSpendSummary(periodExpenses)
          : periodExpenses.length === 0
            ? `No encontré gastos para ${parsedIntent.payload.periodKind === "day" ? "hoy" : parsedIntent.payload.periodKind === "week" ? "esta semana" : "este mes"}.`
            : buildPeriodSummary({
                expenses: periodExpenses,
                periodKind: parsedIntent.payload.periodKind,
              });

      return {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "report_generated",
          summary,
          expenses: periodExpenses,
        },
      };
    }

    return {
      handled: false,
      sourceType: "mobile",
      parsedIntent,
      error: "intent_not_executable",
    };
  };
}
