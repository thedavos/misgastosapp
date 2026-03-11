import { Effect } from "effect";
import type { WorkerEnv } from "types/env";
import {
  EXPENSE_INGESTION_FINAL_RETRY_MESSAGE,
  EXPENSE_INGESTION_RETRY_DELAYS_SECONDS,
  type ExpenseProcessingJob,
} from "@/agents/expense-ingestion.shared";
import { createContainer } from "@/composition/container";
import { getEffectFailureMeta } from "@/utils/effect-failure";

export type ExpenseJobRunResult = { ok: true } | { ok: false; errorMessage: string };

export async function runExpenseProcessingJobOnce(
  env: WorkerEnv,
  job: ExpenseProcessingJob,
): Promise<ExpenseJobRunResult> {
  const requestId = job.requestId
    ? `${job.requestId}:attempt:${job.attempt}`
    : `agent:${job.eventId}:attempt:${job.attempt}`;
  const container = createContainer(env, requestId);

  const result = await Effect.runPromiseExit(
    container.processChatMessage({
      customerId: job.customerId,
      channel: job.channel,
      userId: job.userId,
      providerEventId: job.eventId,
      text: job.text,
      attachments: job.attachments,
      raw: job.raw,
      timestamp: job.timestamp,
      requestId,
    }),
  );

  if (result._tag === "Failure") {
    const { errorCode, errorMessage } = getEffectFailureMeta(result.cause);
    return {
      ok: false,
      errorMessage: errorMessage ?? errorCode ?? "expense ingestion processing failed",
    };
  }

  await container.webhookEventRepo.markProcessed({
    provider: job.provider,
    eventId: job.eventId,
  });

  container.logger.info("expense.agent.job_processed", {
    requestId,
    eventId: job.eventId,
    customerId: job.customerId,
    channel: job.channel,
    userId: job.userId,
    attempt: job.attempt,
  });

  return { ok: true };
}

export async function markExpenseJobFailed(
  env: WorkerEnv,
  job: ExpenseProcessingJob,
  errorMessage: string,
): Promise<void> {
  const requestId = job.requestId
    ? `${job.requestId}:attempt:${job.attempt}`
    : `agent:${job.eventId}:attempt:${job.attempt}`;
  const container = createContainer(env, requestId);

  await container.webhookEventRepo.markFailed({
    provider: job.provider,
    eventId: job.eventId,
    errorMessage,
  });
}

export async function sendExpenseJobRetryGuidance(
  env: WorkerEnv,
  job: ExpenseProcessingJob,
): Promise<void> {
  const requestId = job.requestId
    ? `${job.requestId}:attempt:${job.attempt}`
    : `agent:${job.eventId}:attempt:${job.attempt}`;
  const container = createContainer(env, requestId);

  await container.whatsappChannel.sendMessage({
    userId: job.userId,
    text: EXPENSE_INGESTION_FINAL_RETRY_MESSAGE,
  });
}

type JobLifecycleLogger = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

export async function processExpenseJobAttempt(input: {
  job: ExpenseProcessingJob;
  logger: JobLifecycleLogger;
  runJob: (job: ExpenseProcessingJob) => Promise<ExpenseJobRunResult>;
  scheduleRetry: (delaySeconds: number, job: ExpenseProcessingJob) => Promise<void>;
  markFailed: (job: ExpenseProcessingJob, errorMessage: string) => Promise<void>;
  sendFinalRetryMessage: (job: ExpenseProcessingJob) => Promise<void>;
}): Promise<"processed" | "retry_scheduled" | "failed_final"> {
  const runResult = await input.runJob(input.job);
  if (runResult.ok) {
    return "processed";
  }

  const retryDelay = EXPENSE_INGESTION_RETRY_DELAYS_SECONDS[input.job.attempt];
  if (retryDelay !== undefined) {
    const nextJob = { ...input.job, attempt: input.job.attempt + 1 };
    await input.scheduleRetry(retryDelay, nextJob);
    input.logger.warn("expense.agent.job_retry_scheduled", {
      eventId: input.job.eventId,
      customerId: input.job.customerId,
      channel: input.job.channel,
      userId: input.job.userId,
      attempt: input.job.attempt,
      nextAttempt: nextJob.attempt,
      delaySeconds: retryDelay,
      errorMessage: runResult.errorMessage,
    });
    return "retry_scheduled";
  }

  await input.markFailed(input.job, runResult.errorMessage);
  await input.sendFinalRetryMessage(input.job);
  input.logger.error("expense.agent.job_failed_final", {
    eventId: input.job.eventId,
    customerId: input.job.customerId,
    channel: input.job.channel,
    userId: input.job.userId,
    attempt: input.job.attempt,
    errorMessage: runResult.errorMessage,
  });

  return "failed_final";
}
