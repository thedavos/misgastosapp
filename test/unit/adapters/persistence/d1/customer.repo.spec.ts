import { describe, expect, it } from "vitest";
import { createD1CustomerRepo } from "@/adapters/persistence/d1/customer.repo";

function createUserModelDbStub() {
  const user = {
    id: "user_1",
    name: "David",
    status: "ACTIVE" as const,
    default_currency: "PEN",
    timezone: "America/Lima",
    locale: "es-PE",
    confidence_threshold: 0.75,
  };

  const userSource = {
    id: "src_1",
    customer_id: "user_1",
    channel: "whatsapp",
    external_user_id: "51999999999",
    is_primary: 1,
  };

  return {
    prepare(sql: string) {
      const query = sql.replace(/\s+/g, " ").trim().toLowerCase();

      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (query.includes("from users where id = ?")) {
                const [id] = values as [string];
                return (id === user.id ? (user as T) : null) as T | null;
              }

              if (query.includes("from user_sources us join users u")) {
                const [sourceType, externalId] = values as [string, string];
                return (
                  sourceType === userSource.channel && externalId === userSource.external_user_id
                    ? (user as T)
                    : null
                ) as T | null;
              }

              if (query.includes("from user_sources") && query.includes("external_id as external_user_id")) {
                const [userId, sourceType] = values as [string, string];
                return (
                  userId === user.id && sourceType === userSource.channel
                    ? ({ external_user_id: userSource.external_user_id } as T)
                    : null
                ) as T | null;
              }

              if (query.includes("from user_sources") && query.includes("user_id as customer_id")) {
                const [sourceType, externalId] = values as [string, string];
                return (
                  sourceType === userSource.channel && externalId === userSource.external_user_id
                    ? (userSource as T)
                    : null
                ) as T | null;
              }

              return null;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  } as D1Database;
}

describe("d1 customer repo", () => {
  it("reads users from the MVP core users table when available", async () => {
    const repo = createD1CustomerRepo({ DB: createUserModelDbStub() } as never);

    const customer = await repo.getById("user_1");

    expect(customer).toEqual({
      id: "user_1",
      name: "David",
      status: "ACTIVE",
      defaultCurrency: "PEN",
      timezone: "America/Lima",
      locale: "es-PE",
      confidenceThreshold: 0.75,
    });
  });

  it("resolves channel mappings from user_sources when available", async () => {
    const repo = createD1CustomerRepo({ DB: createUserModelDbStub() } as never);

    const customer = await repo.findByChannelExternalId({
      channel: "whatsapp",
      externalUserId: "51999999999",
    });

    expect(customer?.id).toBe("user_1");
    expect(customer?.name).toBe("David");
  });

  it("returns the primary external id from user_sources when available", async () => {
    const repo = createD1CustomerRepo({ DB: createUserModelDbStub() } as never);

    const externalUserId = await repo.getPrimaryExternalUserId({
      customerId: "user_1",
      channel: "whatsapp",
    });

    expect(externalUserId).toBe("51999999999");
  });

  it("creates a channel mapping in user_sources when the MVP core table is available", async () => {
    const repo = createD1CustomerRepo({ DB: createUserModelDbStub() } as never);

    const mapping = await repo.createChannelMapping({
      customerId: "user_1",
      channel: "whatsapp",
      externalUserId: "51999999999",
      isPrimary: true,
    });

    expect(mapping).toMatchObject({
      customerId: "user_1",
      channel: "whatsapp",
      externalUserId: "51999999999",
      isPrimary: true,
    });
    expect(mapping.id).toBeTruthy();
  });
});
