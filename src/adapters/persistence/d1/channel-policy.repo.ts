import type { WorkerEnv } from "types/env";
import type { Channel, CustomerChannelSetting } from "@/domain/channel/entity";
import type { ChannelPolicyRepoPort } from "@/ports/channel-policy-repo.port";

type ChannelRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type CustomerChannelSettingRow = {
  id: string;
  customer_id: string;
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

function mapCustomerChannelSetting(row: CustomerChannelSettingRow): CustomerChannelSetting {
  return {
    id: row.id,
    customerId: row.customer_id,
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

    async getCustomerChannelSetting(input: {
      customerId: string;
      channelId: string;
    }): Promise<CustomerChannelSetting | null> {
      const row = await env.DB.prepare(
        `SELECT id, customer_id, channel_id, enabled, is_primary, config_json
         FROM customer_channel_settings
         WHERE customer_id = ? AND channel_id = ?
         LIMIT 1`,
      )
        .bind(input.customerId, input.channelId)
        .first<CustomerChannelSettingRow>();

      if (!row) return null;
      return mapCustomerChannelSetting(row);
    },

    async isChannelEnabledForCustomer(input: {
      customerId: string;
      channelId: string;
    }): Promise<boolean> {
      const channel = await this.getChannel(input.channelId);
      if (!channel || channel.status !== "ACTIVE") return false;

      const setting = await this.getCustomerChannelSetting(input);
      if (!setting) {
        return !strictPolicyMode;
      }

      return setting.enabled;
    },
  };
}
