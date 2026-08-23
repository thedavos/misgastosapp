import type { User, UserSource } from "@/domain/user/entity";

export type FindOrCreateByChannelExternalIdResult = {
  user: User;
  created: boolean;
};

export interface UserRepoPort {
  getById(id: string): Promise<User | null>;
  findByChannelExternalId(input: { channel: string; externalUserId: string }): Promise<User | null>;
  findOrCreateByChannelExternalId(input: {
    channel: string;
    externalUserId: string;
    displayName?: string;
  }): Promise<FindOrCreateByChannelExternalIdResult>;
  getPrimaryExternalUserId(input: { userId: string; channel: string }): Promise<string | null>;
  createChannelMapping(input: {
    userId: string;
    channel: string;
    externalUserId: string;
    isPrimary?: boolean;
  }): Promise<UserSource>;
  markOnboardingCompleted(input: { userId: string; completedAt: string }): Promise<void>;
}
