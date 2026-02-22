import type { WorkerEnv } from "types/env";
import type { Customer, CustomerChannel } from "@/domain/customer/entity";
import type { CustomerRepoPort } from "@/ports/customer-repo.port";

type CustomerRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  default_currency: string;
  timezone: string;
  locale: string;
  confidence_threshold: number;
};

type CustomerChannelRow = {
  id: string;
  customer_id: string;
  channel: string;
  external_user_id: string;
  is_primary: number;
};

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    defaultCurrency: row.default_currency,
    timezone: row.timezone,
    locale: row.locale,
    confidenceThreshold: row.confidence_threshold,
  };
}

function mapChannel(row: CustomerChannelRow): CustomerChannel {
  return {
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel,
    externalUserId: row.external_user_id,
    isPrimary: row.is_primary === 1,
  };
}

export function createD1CustomerRepo(env: WorkerEnv): CustomerRepoPort {
  return {
    async getById(id: string): Promise<Customer | null> {
      const row = await env.DB.prepare(
        `SELECT id, name, status, default_currency, timezone, locale, confidence_threshold
         FROM customers WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first<CustomerRow>();

      if (!row) return null;
      return mapCustomer(row);
    },

    async findByChannelExternalId(input: { channel: string; externalUserId: string }): Promise<Customer | null> {
      const row = await env.DB.prepare(
        `SELECT c.id, c.name, c.status, c.default_currency, c.timezone, c.locale, c.confidence_threshold
         FROM customer_channels cc
         JOIN customers c ON c.id = cc.customer_id
         WHERE cc.channel = ? AND cc.external_user_id = ?
         LIMIT 1`,
      )
        .bind(input.channel, input.externalUserId)
        .first<CustomerRow>();

      if (!row) return null;
      return mapCustomer(row);
    },

    async getPrimaryExternalUserId(input: { customerId: string; channel: string }): Promise<string | null> {
      const row = await env.DB.prepare(
        `SELECT external_user_id
         FROM customer_channels
         WHERE customer_id = ? AND channel = ? AND is_primary = 1
         LIMIT 1`,
      )
        .bind(input.customerId, input.channel)
        .first<{ external_user_id: string }>();

      return row?.external_user_id ?? null;
    },

    async createChannelMapping(input: {
      customerId: string;
      channel: string;
      externalUserId: string;
      isPrimary?: boolean;
    }): Promise<CustomerChannel> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const isPrimary = input.isPrimary ? 1 : 0;

      await env.DB.prepare(
        `INSERT OR REPLACE INTO customer_channels (id, customer_id, channel, external_user_id, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, input.customerId, input.channel, input.externalUserId, isPrimary, now, now)
        .run();

      const row = await env.DB.prepare(
        `SELECT id, customer_id, channel, external_user_id, is_primary
         FROM customer_channels
         WHERE channel = ? AND external_user_id = ?
         LIMIT 1`,
      )
        .bind(input.channel, input.externalUserId)
        .first<CustomerChannelRow>();

      if (!row) {
        return {
          id,
          customerId: input.customerId,
          channel: input.channel,
          externalUserId: input.externalUserId,
          isPrimary: isPrimary === 1,
        };
      }

      return mapChannel(row);
    },
  };
}
