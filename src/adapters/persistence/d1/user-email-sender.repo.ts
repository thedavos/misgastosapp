import type { WorkerEnv } from "types/env";
import type { UserEmailSenderRepoPort } from "@/ports/user-email-sender-repo.port";

type UserSourceRow = {
  user_id: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createD1UserEmailSenderRepo(env: WorkerEnv): UserEmailSenderRepoPort {
  return {
    async resolveUserIdBySenderEmail(senderEmail: string): Promise<string | null> {
      const normalizedEmail = normalizeEmail(senderEmail);

      const userSourceRow = await env.DB.prepare(
        `SELECT user_id
         FROM user_sources
         WHERE source_type = 'email' AND external_id = ? AND status = 'active'
         LIMIT 1`,
      )
        .bind(normalizedEmail)
        .first<UserSourceRow>();

      return userSourceRow?.user_id ?? null;
    },
  };
}
