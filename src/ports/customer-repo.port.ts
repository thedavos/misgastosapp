import type { Customer, CustomerChannel } from "@/domain/customer/entity";

export interface CustomerRepoPort {
  getById(id: string): Promise<Customer | null>;
  findByChannelExternalId(input: { channel: string; externalUserId: string }): Promise<Customer | null>;
  getPrimaryExternalUserId(input: { customerId: string; channel: string }): Promise<string | null>;
  createChannelMapping(input: {
    customerId: string;
    channel: string;
    externalUserId: string;
    isPrimary?: boolean;
  }): Promise<CustomerChannel>;
}
