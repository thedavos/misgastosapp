import type { Channel, CustomerChannelSetting } from "@/domain/channel/entity";

export interface ChannelPolicyRepoPort {
  getChannel(channelId: string): Promise<Channel | null>;
  getCustomerChannelSetting(input: {
    customerId: string;
    channelId: string;
  }): Promise<CustomerChannelSetting | null>;
  isChannelEnabledForCustomer(input: {
    customerId: string;
    channelId: string;
  }): Promise<boolean>;
}
