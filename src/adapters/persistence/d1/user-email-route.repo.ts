import type { WorkerEnv } from "types/env";
import type { UserEmailRouteRepoPort } from "@/ports/user-email-route-repo.port";

type UserEmailRouteRow = {
  user_id: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createD1UserEmailRouteRepo(env: WorkerEnv): UserEmailRouteRepoPort {
  return {
    async resolveUserIdByRecipientEmail(recipientEmail: string): Promise<string | null> {
      const normalizedEmail = normalizeEmail(recipientEmail);

      const row = await env.DB.prepare(
        `SELECT user_id
         FROM user_email_routes
         WHERE recipient_email = ? AND enabled = 1
         LIMIT 1`,
      )
        .bind(normalizedEmail)
        .first<UserEmailRouteRow>();

      return row?.user_id ?? null;
    },
  };
}
