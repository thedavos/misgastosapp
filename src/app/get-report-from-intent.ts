import { Effect } from "effect";
import { fromPromise } from "@/app/effects";
import {
  ChannelDisabledError,
  ChannelPolicyError,
  ChannelSendError,
  ExpensePersistenceError,
  FeaturePolicyError,
  SubscriptionFeatureBlockedError,
  type AppError,
} from "@/app/errors";
import type { Expense } from "@/domain/expense/entity";
import type { GetReportIntentPayload } from "@/domain/intent/entity";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";
import type { ChannelPort } from "@/ports/channel.port";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";
import type { FeaturePolicyPort } from "@/ports/feature-policy.port";
import type { LoggerPort } from "@/ports/logger.port";
import { getCurrencySymbol } from "@/utils/currencySymbol";

export type GetReportFromIntentDeps = {
  channel: ChannelPort;
  channelPolicyRepo: ChannelPolicyRepoPort;
  featurePolicy: FeaturePolicyPort;
  expenseRepo: ExpenseRepoPort;
  logger: LoggerPort;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

function getLocalDateParts(dateIso: string, timezone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(dateIso));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
}

function getWeekKey(parts: LocalDateParts): string {
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - weekday + 1);
  return utcDate.toISOString().slice(0, 10);
}

function formatAmount(amount: number, currency: string): string {
  return `${getCurrencySymbol(currency)} ${amount.toFixed(2)}`;
}

function buildPeriodExpenses(input: {
  expenses: Expense[];
  nowIso: string;
  timezone: string;
  periodKind: GetReportIntentPayload["periodKind"];
}): Expense[] {
  const nowParts = getLocalDateParts(input.nowIso, input.timezone);
  const nowWeekKey = getWeekKey(nowParts);

  return input.expenses.filter((expense) => {
    const expenseParts = getLocalDateParts(expense.occurredAt, input.timezone);

    if (input.periodKind === "day") {
      return (
        expenseParts.year === nowParts.year &&
        expenseParts.month === nowParts.month &&
        expenseParts.day === nowParts.day
      );
    }

    if (input.periodKind === "week") {
      return getWeekKey(expenseParts) === nowWeekKey;
    }

    if (input.periodKind === "month" || input.periodKind === "top_spend") {
      return expenseParts.year === nowParts.year && expenseParts.month === nowParts.month;
    }

    return false;
  });
}

function buildPeriodSummary(input: {
  expenses: Expense[];
  periodKind: Exclude<GetReportIntentPayload["periodKind"], "top_spend">;
}): string {
  const count = input.expenses.length;
  const total = input.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const currency = input.expenses[0]?.currency ?? "PEN";
  const topMerchant = new Map<string, number>();

  for (const expense of input.expenses) {
    topMerchant.set(expense.merchant, (topMerchant.get(expense.merchant) ?? 0) + expense.amount);
  }

  const strongestMerchant = Array.from(topMerchant.entries()).sort((a, b) => b[1] - a[1])[0];
  const periodLabel =
    input.periodKind === "day"
      ? "hoy"
      : input.periodKind === "week"
        ? "esta semana"
        : "este mes";

  const lines = [
    `Resumen de ${periodLabel}:`,
    `- Total: ${formatAmount(total, currency)}`,
    `- Movimientos: ${count}`,
  ];

  if (strongestMerchant) {
    lines.push(
      `- Más gasto en: ${strongestMerchant[0]} (${formatAmount(strongestMerchant[1], currency)})`,
    );
  }

  return lines.join("\n");
}

function buildTopSpendSummary(expenses: Expense[]): string {
  const byMerchant = new Map<string, { total: number; currency: string }>();

  for (const expense of expenses) {
    const current = byMerchant.get(expense.merchant);
    byMerchant.set(expense.merchant, {
      total: (current?.total ?? 0) + expense.amount,
      currency: expense.currency,
    });
  }

  const ranking = Array.from(byMerchant.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3);

  if (ranking.length === 0) {
    return "No encontré gastos para mostrarte en qué gastaste más este mes.";
  }

  return [
    "En qué gastaste más este mes:",
    ...ranking.map(
      ([merchant, data], index) =>
        `${index + 1}. ${merchant} — ${formatAmount(data.total, data.currency)}`,
    ),
  ].join("\n");
}

export function createGetReportFromIntent(deps: GetReportFromIntentDeps) {
  return function getReportFromIntent(input: {
    customerId: string;
    channel: string;
    userId: string;
    payload: GetReportIntentPayload;
    timezone: string;
    nowIso: string;
    requestId?: string;
  }): Effect.Effect<{ handled: boolean }, AppError> {
    return Effect.gen(function* () {
      const expenses = yield* fromPromise(
        () => deps.expenseRepo.listByCustomer({ customerId: input.customerId }),
        (cause) =>
          new ExpensePersistenceError({
            requestId: input.requestId,
            operation: "listByCustomer",
            cause,
          }),
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
        () => deps.featurePolicy.isFeatureEnabled({ customerId: input.customerId, featureKey }),
        (cause) => new FeaturePolicyError({ requestId: input.requestId, featureKey, cause }),
      );

      if (!featureEnabled) {
        return yield* Effect.fail(
          new SubscriptionFeatureBlockedError({
            requestId: input.requestId,
            customerId: input.customerId,
            featureKey,
          }),
        );
      }

      const periodExpenses = buildPeriodExpenses({
        expenses,
        nowIso: input.nowIso,
        timezone: input.timezone,
        periodKind: input.payload.periodKind,
      });

      const message =
        input.payload.periodKind === "top_spend"
          ? buildTopSpendSummary(periodExpenses)
          : periodExpenses.length === 0
            ? `No encontré gastos para ${input.payload.periodKind === "day" ? "hoy" : input.payload.periodKind === "week" ? "esta semana" : "este mes"}.`
            : buildPeriodSummary({ expenses: periodExpenses, periodKind: input.payload.periodKind });

      yield* fromPromise(
        () => deps.channel.sendMessage({ userId: input.userId, text: message }),
        (cause) => new ChannelSendError({ requestId: input.requestId, cause }),
      );

      deps.logger.info("report.generated_from_intent", {
        requestId: input.requestId,
        customerId: input.customerId,
        channel: input.channel,
        userId: input.userId,
        periodKind: input.payload.periodKind,
        expenseCount: periodExpenses.length,
      });

      return { handled: true };
    });
  };
}
