import type { Channel, UserChannelSetting } from "@/domain/channel/entity";

export interface ChannelPolicyRepoPort {
  getChannel(channelId: string): Promise<Channel | null>;
  getUserChannelSetting(input: {
    customerId: string;
    channelId: string;
  }): Promise<UserChannelSetting | null>;
  isChannelEnabledForUser(input: { customerId: string; channelId: string }): Promise<boolean>;
}
