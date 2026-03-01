import { createIngestExpenseFromEmail, type IngestExpenseFromEmailDeps } from "@/app/ingest-expense-from-email";

export type IngestPendingExpenseDeps = IngestExpenseFromEmailDeps;

export function createIngestPendingExpense(deps: IngestPendingExpenseDeps) {
  const ingestExpenseFromEmail = createIngestExpenseFromEmail(deps);

  return function ingestPendingExpense(input: {
    customerId: string;
    sourceText: string;
    channel: string;
    userId: string;
    requestId?: string;
  }) {
    return ingestExpenseFromEmail({
      customerId: input.customerId,
      emailText: input.sourceText,
      channel: input.channel,
      userId: input.userId,
      requestId: input.requestId,
    });
  };
}
