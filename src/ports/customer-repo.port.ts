import type { Customer, CustomerChannel } from "@/domain/customer/entity";

export interface CustomerRepoPort {
  getById(id: string): Promise<Customer | null>;
  findByChannelExternalId(input: { channel: string; externalUserId: string }): Promise<Customer | null>;
  createChannelMapping(input: {
    customerId: string;
    channel: string;
    externalUserId: string;
    isPrimary?: boolean;
  }): Promise<CustomerChannel>;
}
