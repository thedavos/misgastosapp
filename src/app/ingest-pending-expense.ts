import {
  createCaptureExpenseWithClarification,
  type CaptureExpenseWithClarificationDeps,
} from "@/app/ingest-expense-from-email";

export type FallbackExpenseCaptureDeps = CaptureExpenseWithClarificationDeps;

export function createFallbackExpenseCapture(deps: FallbackExpenseCaptureDeps) {
  const captureExpenseWithClarification = createCaptureExpenseWithClarification(deps);

  return function fallbackExpenseCapture(input: {
    customerId: string;
    sourceText: string;
    channel: string;
    userId: string;
    requestId?: string;
  }) {
    return captureExpenseWithClarification({
      customerId: input.customerId,
      sourceText: input.sourceText,
      channel: input.channel,
      userId: input.userId,
      requestId: input.requestId,
    });
  };
}
