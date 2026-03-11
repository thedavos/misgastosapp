import type { WorkerEnv } from "types/env";
import {
  buildExpenseIngestionAgentName,
  type ExpenseProcessingJob,
} from "@/agents/expense-ingestion.shared";

export async function enqueueExpenseProcessingJob(
  env: WorkerEnv,
  job: ExpenseProcessingJob,
): Promise<void> {
  const agentName = buildExpenseIngestionAgentName({
    customerId: job.customerId,
    channel: job.channel,
    userId: job.userId,
  });
  const id = env.ExpenseIngestionAgent.idFromName(agentName);
  const stub = env.ExpenseIngestionAgent.get(id);

  const response = await stub.fetch(
    new Request("https://expense-ingestion.internal/enqueue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job),
    }),
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ExpenseIngestionAgent enqueue failed (${response.status}): ${details}`);
  }
}
