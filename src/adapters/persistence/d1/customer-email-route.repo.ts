import type { WorkerEnv } from "types/env";
import type { CustomerEmailRouteRepoPort } from "@/ports/customer-email-route-repo.port";

type CustomerEmailRouteRow = {
  customer_id: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createD1CustomerEmailRouteRepo(env: WorkerEnv): CustomerEmailRouteRepoPort {
  return {
    async resolveCustomerIdByRecipientEmail(recipientEmail: string): Promise<string | null> {
      const row = await env.DB.prepare(
        `SELECT customer_id
         FROM customer_email_routes
         WHERE recipient_email = ? AND enabled = 1
         LIMIT 1`,
      )
        .bind(normalizeEmail(recipientEmail))
        .first<CustomerEmailRouteRow>();

      return row?.customer_id ?? null;
    },
  };
}
