import type { WorkerEnv } from "types/env";
import type { Channel, UserChannelSetting } from "@/domain/channel/entity";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";

type ChannelRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type UserChannelSettingRow = {
  id: string;
  user_id: string;
  channel_id: string;
  enabled: number;
  is_primary: number;
  config_json: string | null;
};

function mapChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
  };
}

function mapUserChannelSetting(row: UserChannelSettingRow): UserChannelSetting {
  return {
    id: row.id,
    userId: row.user_id,
    channelId: row.channel_id,
    enabled: row.enabled === 1,
    isPrimary: row.is_primary === 1,
    configJson: row.config_json,
  };
}

export function createD1ChannelPolicyRepo(env: WorkerEnv): ChannelPolicyRepoPort {
  const strictPolicyMode = env.STRICT_POLICY_MODE !== "false";

  return {
    async getChannel(channelId: string): Promise<Channel | null> {
      const row = await env.DB.prepare(
        `SELECT id, name, status
         FROM channels
         WHERE id = ?
         LIMIT 1`,
      )
        .bind(channelId)
        .first<ChannelRow>();

      if (!row) return null;
      return mapChannel(row);
    },

    async getUserChannelSetting(input: {
      userId: string;
      channelId: string;
    }): Promise<UserChannelSetting | null> {
      const row = await env.DB.prepare(
        `SELECT id, user_id, channel_id, enabled, is_primary, config_json
         FROM user_channel_settings
         WHERE user_id = ? AND channel_id = ?
         LIMIT 1`,
      )
        .bind(input.userId, input.channelId)
        .first<UserChannelSettingRow>();

      if (!row) return null;
      return mapUserChannelSetting(row);
    },

    async isChannelEnabledForUser(input: { userId: string; channelId: string }): Promise<boolean> {
      const channel = await this.getChannel(input.channelId);
      if (!channel || channel.status !== "ACTIVE") return false;

      const setting = await this.getUserChannelSetting(input);
      if (!setting) {
        return !strictPolicyMode;
      }

      return setting.enabled;
    },
  };
}
