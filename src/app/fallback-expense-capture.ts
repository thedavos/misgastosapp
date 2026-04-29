import {
  createCaptureExpenseWithClarification,
  type CaptureExpenseWithClarificationDeps,
} from "@/app/capture-expense-with-clarification";

export type FallbackExpenseCaptureDeps = CaptureExpenseWithClarificationDeps;

export function createFallbackExpenseCapture(deps: FallbackExpenseCaptureDeps) {
  const captureExpenseWithClarification = createCaptureExpenseWithClarification(deps);

  return function fallbackExpenseCapture(input: {
    userId: string;
    sourceText: string;
    channel: string;
    externalUserId: string;
    requestId?: string;
  }) {
    return captureExpenseWithClarification({
      userId: input.userId,
      sourceText: input.sourceText,
      channel: input.channel,
      externalUserId: input.externalUserId,
      requestId: input.requestId,
    });
  };
}
