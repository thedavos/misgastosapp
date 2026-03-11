import { Agent } from "agents";
import type { WorkerEnv } from "types/env";
import {
  markExpenseJobFailed,
  processExpenseJobAttempt,
  runExpenseProcessingJobOnce,
  sendExpenseJobRetryGuidance,
} from "@/agents/expense-ingestion.logic";
import {
  parseExpenseProcessingJob,
  type ExpenseProcessingJob,
} from "@/agents/expense-ingestion.shared";
import { createContainer } from "@/composition/container";

export class ExpenseIngestionAgent extends Agent<WorkerEnv> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/enqueue") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const job = parseExpenseProcessingJob(payload);
    if (!job) {
      return new Response("Invalid payload", { status: 400 });
    }

    await this.schedule(0, "processJob", job);
    return Response.json({ queued: true }, { status: 202 });
  }

  async processJob(job: ExpenseProcessingJob): Promise<void> {
    const requestId = job.requestId
      ? `${job.requestId}:attempt:${job.attempt}`
      : `agent:${job.eventId}:attempt:${job.attempt}`;
    const container = createContainer(this.env, requestId);

    await processExpenseJobAttempt({
      job,
      logger: container.logger,
      runJob: (jobInput) => runExpenseProcessingJobOnce(this.env, jobInput),
      scheduleRetry: async (delaySeconds, nextJob) => {
        await this.schedule(delaySeconds, "processJob", nextJob);
      },
      markFailed: async (failedJob, errorMessage) => {
        await markExpenseJobFailed(this.env, failedJob, errorMessage);
      },
      sendFinalRetryMessage: async (failedJob) => {
        await sendExpenseJobRetryGuidance(this.env, failedJob);
      },
    });
  }
}
