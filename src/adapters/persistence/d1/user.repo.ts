import type { WorkerEnv } from "types/env";
import type { User, UserSource } from "@/domain/user/entity";
import type { UserRepoPort } from "@/ports/user-repo.port";

type UserRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  default_currency: string;
  timezone: string;
  locale: string;
  confidence_threshold: number;
};

type UserSourceRow = {
  id: string;
  user_id: string;
  source_type: string;
  external_id: string;
  is_primary: number;
};

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    defaultCurrency: row.default_currency,
    timezone: row.timezone,
    locale: row.locale,
    confidenceThreshold: row.confidence_threshold,
  };
}

function mapUserSource(row: UserSourceRow): UserSource {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.source_type,
    externalUserId: row.external_id,
    isPrimary: row.is_primary === 1,
  };
}

export function createD1UserRepo(env: WorkerEnv): UserRepoPort {
  return {
    async getById(id: string): Promise<User | null> {
      const row = await env.DB.prepare(
        `SELECT id,
                display_name AS name,
                status,
                default_currency,
                timezone,
                locale,
                confidence_threshold
         FROM users WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first<UserRow>();

      if (!row) return null;
      return mapUser(row);
    },

    async findByChannelExternalId(input: {
      channel: string;
      externalUserId: string;
    }): Promise<User | null> {
      const row = await env.DB.prepare(
        `SELECT u.id,
                u.display_name AS name,
                u.status,
                u.default_currency,
                u.timezone,
                u.locale,
                u.confidence_threshold
         FROM user_sources us
         JOIN users u ON u.id = us.user_id
         WHERE us.source_type = ? AND us.external_id = ? AND us.status = 'active'
         LIMIT 1`,
      )
        .bind(input.channel, input.externalUserId)
        .first<UserRow>();

      if (!row) return null;
      return mapUser(row);
    },

    async getPrimaryExternalUserId(input: {
      userId: string;
      channel: string;
    }): Promise<string | null> {
      const row = await env.DB.prepare(
        `SELECT external_id AS external_user_id
         FROM user_sources
         WHERE user_id = ? AND source_type = ? AND is_primary = 1 AND status = 'active'
         LIMIT 1`,
      )
        .bind(input.userId, input.channel)
        .first<{ external_user_id: string }>();

      return row?.external_user_id ?? null;
    },

    async createChannelMapping(input: {
      userId: string;
      channel: string;
      externalUserId: string;
      isPrimary?: boolean;
    }): Promise<UserSource> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const isPrimary = input.isPrimary ? 1 : 0;

      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_sources (id, user_id, source_type, external_id, status, is_primary, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
      )
        .bind(id, input.userId, input.channel, input.externalUserId, isPrimary, now, now)
        .run();

      const userSourceRow = await env.DB.prepare(
        `SELECT id, user_id, source_type, external_id, is_primary
         FROM user_sources
         WHERE source_type = ? AND external_id = ?
         LIMIT 1`,
      )
        .bind(input.channel, input.externalUserId)
        .first<UserSourceRow>();

      if (userSourceRow) {
        return mapUserSource(userSourceRow);
      }

      return {
        id,
        userId: input.userId,
        channel: input.channel,
        externalUserId: input.externalUserId,
        isPrimary: isPrimary === 1,
      };
    },
  };
}
