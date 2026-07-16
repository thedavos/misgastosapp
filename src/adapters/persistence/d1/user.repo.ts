import type { WorkerEnv } from "types/env";
import type { User, UserSource } from "@/domain/user/entity";
import type { FindOrCreateByChannelExternalIdResult, UserRepoPort } from "@/ports/user-repo.port";

type UserRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  default_currency: string;
  timezone: string;
  locale: string;
  confidence_threshold: number;
  onboarding_completed_at: string | null;
};

type UserSourceRow = {
  id: string;
  user_id: string;
  source_type: string;
  external_id: string;
  is_primary: number;
};

const DEFAULT_CURRENCY = "PEN";
const DEFAULT_TIMEZONE = "America/Lima";
const DEFAULT_LOCALE = "es-PE";

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    defaultCurrency: row.default_currency || DEFAULT_CURRENCY,
    timezone: row.timezone || DEFAULT_TIMEZONE,
    locale: row.locale || DEFAULT_LOCALE,
    confidenceThreshold: row.confidence_threshold,
    onboardingCompletedAt: row.onboarding_completed_at,
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

const USER_SELECT = `SELECT id,
                display_name AS name,
                status,
                default_currency,
                timezone,
                locale,
                confidence_threshold,
                onboarding_completed_at
         FROM users`;

export function createD1UserRepo(env: WorkerEnv): UserRepoPort {
  async function ensureChannelSetting(input: {
    userId: string;
    channelId: string;
    isPrimary: number;
  }): Promise<void> {
    const existing = await env.DB.prepare(
      `SELECT id FROM user_channel_settings WHERE user_id = ? AND channel_id = ? LIMIT 1`,
    )
      .bind(input.userId, input.channelId)
      .first<{ id: string }>();
    if (existing) return;

    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO user_channel_settings (id, user_id, channel_id, enabled, is_primary, config_json, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, NULL, ?, ?)`,
    )
      .bind(crypto.randomUUID(), input.userId, input.channelId, input.isPrimary, now, now)
      .run();
  }

  async function ensureDefaultChannelSettings(userId: string, channel: string): Promise<void> {
    // Mobile is a first-class API channel; provision for every user so strict policy mode
    // does not 403 new WhatsApp/Telegram users who later call mobile endpoints.
    await ensureChannelSetting({ userId, channelId: "mobile", isPrimary: 0 });

    if (channel === "whatsapp") {
      await ensureChannelSetting({ userId, channelId: "whatsapp", isPrimary: 1 });
    }
  }

  return {
    async getById(id: string): Promise<User | null> {
      const row = await env.DB.prepare(`${USER_SELECT} WHERE id = ? LIMIT 1`)
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
                u.confidence_threshold,
                u.onboarding_completed_at
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

    async findOrCreateByChannelExternalId(input: {
      channel: string;
      externalUserId: string;
      displayName?: string;
    }): Promise<FindOrCreateByChannelExternalIdResult> {
      const existing = await this.findByChannelExternalId({
        channel: input.channel,
        externalUserId: input.externalUserId,
      });
      if (existing) {
        await ensureDefaultChannelSettings(existing.id, input.channel);
        return { user: existing, created: false };
      }

      const userId = crypto.randomUUID();
      const sourceId = crypto.randomUUID();
      const now = new Date().toISOString();
      const displayName =
        input.displayName?.trim() ||
        (input.channel === "whatsapp" ? `WhatsApp ${input.externalUserId}` : input.externalUserId);

      await env.DB.prepare(
        `INSERT INTO users (
           id, display_name, default_currency, timezone, locale, created_at, updated_at,
           status, confidence_threshold, onboarding_completed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0.75, NULL)`,
      )
        .bind(userId, displayName, DEFAULT_CURRENCY, DEFAULT_TIMEZONE, DEFAULT_LOCALE, now, now)
        .run();

      // INSERT OR IGNORE + unique (source_type, external_id) makes concurrent create races
      // converge on one mapped user instead of orphaning via INSERT OR REPLACE.
      const mappingResult = await env.DB.prepare(
        `INSERT OR IGNORE INTO user_sources (
           id, user_id, source_type, external_id, status, is_primary, metadata_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
      )
        .bind(sourceId, userId, input.channel, input.externalUserId, 1, now, now)
        .run();

      if ((mappingResult.meta?.changes ?? 0) === 0) {
        await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();

        const winner = await this.findByChannelExternalId({
          channel: input.channel,
          externalUserId: input.externalUserId,
        });
        if (!winner) {
          throw new Error(
            `Failed to resolve concurrent user mapping for ${input.channel}:${input.externalUserId}`,
          );
        }

        await ensureDefaultChannelSettings(winner.id, input.channel);
        return { user: winner, created: false };
      }

      await ensureDefaultChannelSettings(userId, input.channel);

      const created = await this.getById(userId);
      if (!created) {
        throw new Error(`Failed to load newly created user ${userId}`);
      }

      return { user: created, created: true };
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

    async markOnboardingCompleted(input: { userId: string; completedAt: string }): Promise<void> {
      await env.DB.prepare(
        `UPDATE users
         SET onboarding_completed_at = ?, updated_at = ?
         WHERE id = ? AND onboarding_completed_at IS NULL`,
      )
        .bind(input.completedAt, input.completedAt, input.userId)
        .run();
    },
  };
}
