import type { User, UserSource } from "@/domain/user/entity";

export interface UserRepoPort {
  getById(id: string): Promise<User | null>;
  findByChannelExternalId(input: {
    channel: string;
    externalUserId: string;
  }): Promise<User | null>;
  getPrimaryExternalUserId(input: { userId: string; channel: string }): Promise<string | null>;
  createChannelMapping(input: {
    userId: string;
    channel: string;
    externalUserId: string;
    isPrimary?: boolean;
  }): Promise<UserSource>;
}
