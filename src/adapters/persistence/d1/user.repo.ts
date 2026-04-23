import type { WorkerEnv } from "types/env";
import type { User, UserSource } from "@/domain/user/entity";
import type { UserRepoPort } from "@/ports/user-repo.port";

type LegacyCustomerRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  default_currency: string;
  timezone: string;
  locale: string;
  confidence_threshold: number;
};

type LegacyCustomerChannelRow = {
  id: string;
  customer_id: string;
  channel: string;
  external_user_id: string;
  is_primary: number;
};

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

function mapUser(row: LegacyCustomerRow | UserRow): User {
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

function mapUserSource(row: LegacyCustomerChannelRow | UserSourceRow): UserSource {
  if ("user_id" in row) {
    return {
      id: row.id,
      userId: row.user_id,
      channel: row.source_type,
      externalUserId: row.external_id,
      isPrimary: row.is_primary === 1,
    };
  }

  return {
    id: row.id,
    userId: row.customer_id,
    channel: row.channel,
    externalUserId: row.external_user_id,
    isPrimary: row.is_primary === 1,
  };
}

export function createD1UserRepo(env: WorkerEnv): UserRepoPort {
  return {
    async getById(id: string): Promise<User | null> {
      const row =
        (await env.DB.prepare(
          `SELECT id,
                  display_name AS name,
                  'ACTIVE' AS status,
                  default_currency,
                  timezone,
                  locale,
                  0.75 AS confidence_threshold
           FROM users WHERE id = ? LIMIT 1`,
        )
          .bind(id)
          .first<UserRow>()) ??
        (await env.DB.prepare(
          `SELECT id, name, status, default_currency, timezone, locale, confidence_threshold
           FROM customers WHERE id = ? LIMIT 1`,
        )
          .bind(id)
          .first<LegacyCustomerRow>());

      if (!row) return null;
      return mapUser(row);
    },

    async findByChannelExternalId(input: {
      channel: string;
      externalUserId: string;
    }): Promise<User | null> {
      const row =
        (await env.DB.prepare(
          `SELECT u.id,
                  u.display_name AS name,
                  'ACTIVE' AS status,
                  u.default_currency,
                  u.timezone,
                  u.locale,
                  0.75 AS confidence_threshold
           FROM user_sources us
           JOIN users u ON u.id = us.user_id
           WHERE us.source_type = ? AND us.external_id = ? AND us.status = 'active'
           LIMIT 1`,
        )
          .bind(input.channel, input.externalUserId)
          .first<UserRow>()) ??
        (await env.DB.prepare(
          `SELECT c.id, c.name, c.status, c.default_currency, c.timezone, c.locale, c.confidence_threshold
           FROM customer_channels cc
           JOIN customers c ON c.id = cc.customer_id
           WHERE cc.channel = ? AND cc.external_user_id = ?
           LIMIT 1`,
        )
          .bind(input.channel, input.externalUserId)
          .first<LegacyCustomerRow>());

      if (!row) return null;
      return mapUser(row);
    },

    async getPrimaryExternalUserId(input: {
      userId: string;
      channel: string;
    }): Promise<string | null> {
      const row =
        (await env.DB.prepare(
          `SELECT external_id AS external_user_id
           FROM user_sources
           WHERE user_id = ? AND source_type = ? AND is_primary = 1 AND status = 'active'
           LIMIT 1`,
        )
          .bind(input.userId, input.channel)
          .first<{ external_user_id: string }>()) ??
        (await env.DB.prepare(
          `SELECT external_user_id
           FROM customer_channels
           WHERE customer_id = ? AND channel = ? AND is_primary = 1
           LIMIT 1`,
        )
          .bind(input.userId, input.channel)
          .first<{ external_user_id: string }>()) ;

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

      await env.DB.prepare(
        `INSERT OR REPLACE INTO customer_channels (id, customer_id, channel, external_user_id, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, input.userId, input.channel, input.externalUserId, isPrimary, now, now)
        .run();

      const row = await env.DB.prepare(
        `SELECT id, customer_id, channel, external_user_id, is_primary
         FROM customer_channels
         WHERE channel = ? AND external_user_id = ?
         LIMIT 1`,
      )
        .bind(input.channel, input.externalUserId)
        .first<LegacyCustomerChannelRow>();

      if (!row) {
        return {
          id,
          userId: input.userId,
          channel: input.channel,
          externalUserId: input.externalUserId,
          isPrimary: isPrimary === 1,
        };
      }

      return mapUserSource(row);
    },
  };
}
