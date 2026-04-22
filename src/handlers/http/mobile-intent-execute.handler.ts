import type { WorkerEnv } from "types/env";
import type { ParsedIntent } from "@/domain/intent/entity";
import { createContainer } from "@/composition/container";
import { buildPeriodExpenses, buildPeriodSummary, buildTopSpendSummary } from "@/app/report-summary";

function canApplyCreateExpenseDirectly(intent: ParsedIntent): boolean {
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

function canApplyUpdateIntentDirectly(intent: ParsedIntent): boolean {
  return (
    intent.name === "update_last_expense" &&
    intent.payload.confidence >= 0.9 &&
    intent.payload.patch.amountMinor !== undefined
  );
}

function canApplyDeleteIntentDirectly(intent: ParsedIntent): boolean {
  return intent.name === "delete_last_expense" && intent.payload.confidence >= 0.9;
}

function canApplyReportIntentDirectly(intent: ParsedIntent): boolean {
  return intent.name === "get_report" && intent.payload.confidence >= 0.9;
}

export async function handleMobileIntentExecute(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const requestId = request.headers.get("cf-ray") ?? undefined;
  const container = createContainer(env, requestId);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const record = payload as Record<string, unknown>;
  const customerId = typeof record.customerId === "string" ? record.customerId.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";

  if (!customerId || !text) {
    return Response.json({ error: "customerId_and_text_required" }, { status: 400 });
  }

  const customer = await container.customerRepo.getById(customerId);
  if (!customer) {
    return Response.json({ error: "customer_not_found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const parsedIntent = await container.parseUserIntent({
    text,
    context: {
      sourceType: "mobile",
      timezone: customer.timezone,
      defaultCurrency: customer.defaultCurrency,
      nowIso,
    },
    requestId,
  });

  if (canApplyCreateExpenseDirectly(parsedIntent)) {
    const created = await container.expenseRepo.createExpenseRecord({
      customerId,
      amount: parsedIntent.payload.draft.amountMinor! / 100,
      currency: parsedIntent.payload.draft.currency!,
      merchant: parsedIntent.payload.draft.merchant!,
      occurredAt: parsedIntent.payload.draft.occurredAt!,
      bank: "mobile",
      rawText: parsedIntent.payload.draft.description ?? text,
    });

    return Response.json(
      {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "expense_created",
          expense: created,
        },
      },
      { status: 200 },
    );
  }

  if (canApplyUpdateIntentDirectly(parsedIntent)) {
    const latestExpense = await container.expenseRepo.findLatestByCustomer({ customerId });
    if (!latestExpense) {
      return Response.json(
        {
          handled: true,
          sourceType: "mobile",
          parsedIntent,
          result: {
            kind: "no_latest_expense",
            message: "No encontré un gasto reciente para corregir.",
          },
        },
        { status: 200 },
      );
    }

    const updated = await container.expenseRepo.update({
      id: latestExpense.id,
      customerId,
      amount: parsedIntent.payload.patch.amountMinor! / 100,
      currency: parsedIntent.payload.patch.currency ?? latestExpense.currency,
      merchant: parsedIntent.payload.patch.merchant ?? latestExpense.merchant,
      occurredAt: parsedIntent.payload.patch.occurredAt ?? latestExpense.occurredAt,
      rawText: latestExpense.rawText,
    });

    return Response.json(
      {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "expense_updated",
          expense: updated,
        },
      },
      { status: 200 },
    );
  }

  if (canApplyDeleteIntentDirectly(parsedIntent)) {
    const latestExpense = await container.expenseRepo.findLatestByCustomer({ customerId });
    if (!latestExpense) {
      return Response.json(
        {
          handled: true,
          sourceType: "mobile",
          parsedIntent,
          result: {
            kind: "no_latest_expense",
            message: "No encontré un gasto reciente para eliminar.",
          },
        },
        { status: 200 },
      );
    }

    const discarded = await container.expenseRepo.discard({
      id: latestExpense.id,
      customerId,
    });

    return Response.json(
      {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "expense_deleted",
          expense: discarded,
        },
      },
      { status: 200 },
    );
  }

  if (canApplyReportIntentDirectly(parsedIntent)) {
    const expenses = await container.expenseRepo.listByCustomer({ customerId });
    const periodExpenses = buildPeriodExpenses({
      expenses,
      nowIso,
      timezone: customer.timezone,
      periodKind: parsedIntent.payload.periodKind,
    });

    const summary =
      parsedIntent.payload.periodKind === "top_spend"
        ? buildTopSpendSummary(periodExpenses)
        : periodExpenses.length === 0
          ? `No encontré gastos para ${parsedIntent.payload.periodKind === "day" ? "hoy" : parsedIntent.payload.periodKind === "week" ? "esta semana" : "este mes"}.`
          : buildPeriodSummary({ expenses: periodExpenses, periodKind: parsedIntent.payload.periodKind });

    return Response.json(
      {
        handled: true,
        sourceType: "mobile",
        parsedIntent,
        result: {
          kind: "report_generated",
          summary,
          expenses: periodExpenses,
        },
      },
      { status: 200 },
    );
  }

  return Response.json(
    {
      handled: false,
      sourceType: "mobile",
      parsedIntent,
      error: "intent_not_executable",
    },
    { status: 422 },
  );
}
