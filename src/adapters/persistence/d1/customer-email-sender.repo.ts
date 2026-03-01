import type { WorkerEnv } from "types/env";
import type { CustomerEmailSenderRepoPort } from "@/ports/customer-email-sender-repo.port";

type CustomerEmailSenderRow = {
  customer_id: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createD1CustomerEmailSenderRepo(env: WorkerEnv): CustomerEmailSenderRepoPort {
  return {
    async resolveCustomerIdBySenderEmail(senderEmail: string): Promise<string | null> {
      const row = await env.DB.prepare(
        `SELECT customer_id
         FROM customer_email_senders
         WHERE sender_email = ? AND enabled = 1
         LIMIT 1`,
      )
        .bind(normalizeEmail(senderEmail))
        .first<CustomerEmailSenderRow>();

      return row?.customer_id ?? null;
    },
  };
}
