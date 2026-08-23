export type SupportedSourceType = "whatsapp" | "email" | "mobile" | "telegram";

export type IntentName =
  | "create_expense"
  | "update_last_expense"
  | "delete_last_expense"
  | "get_report"
  | "help"
  | "unknown";

export type IntentMissingField = "amount" | "merchant" | "date" | "category";

export interface ParsedExpenseDraft {
  amountMinor?: number;
  currency?: string;
  merchant?: string;
  description?: string;
  categoryName?: string;
  occurredAt?: string;
}

export interface CreateExpenseIntentPayload {
  draft: ParsedExpenseDraft;
  missingFields: IntentMissingField[];
  confidence: number;
}

export interface UpdateLastExpenseIntentPayload {
  patch: Partial<ParsedExpenseDraft>;
  confidence: number;
}

export interface DeleteLastExpenseIntentPayload {
  confidence: number;
}

export interface GetReportIntentPayload {
  periodKind: "day" | "week" | "month" | "top_spend";
  confidence: number;
}

export interface HelpIntentPayload {
  topic?: "examples" | "commands" | "categories";
  confidence: number;
}

export interface UnknownIntentPayload {
  reason?: string;
  confidence: number;
}

export type ParsedIntent =
  | { name: "create_expense"; payload: CreateExpenseIntentPayload }
  | { name: "update_last_expense"; payload: UpdateLastExpenseIntentPayload }
  | { name: "delete_last_expense"; payload: DeleteLastExpenseIntentPayload }
  | { name: "get_report"; payload: GetReportIntentPayload }
  | { name: "help"; payload: HelpIntentPayload }
  | { name: "unknown"; payload: UnknownIntentPayload };

export interface IntentContext {
  sourceType: SupportedSourceType;
  timezone: string;
  defaultCurrency: string;
  nowIso: string;
}
