import type { Expense } from "@/domain/expense/entity";
import type { GetReportIntentPayload } from "@/domain/intent/entity";
import { getCurrencySymbol } from "@/utils/currencySymbol";

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

export function buildPeriodExpenses(input: {
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

export function buildPeriodSummary(input: {
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
    input.periodKind === "day" ? "hoy" : input.periodKind === "week" ? "esta semana" : "este mes";

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

export function buildTopSpendSummary(expenses: Expense[]): string {
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
