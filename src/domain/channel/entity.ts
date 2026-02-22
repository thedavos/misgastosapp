export type ChannelStatus = "ACTIVE" | "INACTIVE";

export interface Channel {
  id: string;
  name: string;
  status: ChannelStatus;
}

export interface CustomerChannelSetting {
  id: string;
  customerId: string;
  channelId: string;
  enabled: boolean;
  isPrimary: boolean;
  configJson: string | null;
}
