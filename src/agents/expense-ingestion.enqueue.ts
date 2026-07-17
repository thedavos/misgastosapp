import type { WorkerEnv } from "types/env";
import {
  buildExpenseIngestionAgentName,
  type ExpenseProcessingJob,
} from "@/agents/expense-ingestion.shared";

/**
 * PartyServer/Agents SDK requires the Durable Object "room" name to be set before
 * Agent.onRequest runs. Prefer this over raw namespace.get(id).fetch(...) without headers.
 */
async function getNamedExpenseIngestionStub(
  env: WorkerEnv,
  agentName: string,
): Promise<DurableObjectStub> {
  const id = env.ExpenseIngestionAgent.idFromName(agentName);
  const stub = env.ExpenseIngestionAgent.get(id);

  const initRequest = new Request(
    "https://expense-ingestion.internal/cdn-cgi/partyserver/set-name/",
  );
  initRequest.headers.set("x-partykit-room", agentName);
  await stub.fetch(initRequest);

  return stub;
}

export async function enqueueExpenseProcessingJob(
  env: WorkerEnv,
  job: ExpenseProcessingJob,
): Promise<void> {
  const agentName = buildExpenseIngestionAgentName({
    userId: job.userId,
    channel: job.channel,
    externalUserId: job.externalUserId,
  });

  const stub = await getNamedExpenseIngestionStub(env, agentName);

  const response = await stub.fetch(
    new Request("https://expense-ingestion.internal/enqueue", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-partykit-room": agentName,
      },
      body: JSON.stringify(job),
    }),
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ExpenseIngestionAgent enqueue failed (${response.status}): ${details}`);
  }
}
