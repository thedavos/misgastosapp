import { describe, expect, it } from "vitest";
import { createD1UserRepo } from "@/adapters/persistence/d1/user.repo";

function createUserModelDbStub() {
  const user = {
    id: "user_1",
    name: "David",
    status: "ACTIVE" as const,
    default_currency: "PEN",
    timezone: "America/Lima",
    locale: "es-PE",
    confidence_threshold: 0.75,
    onboarding_completed_at: null,
  };

  const userSource = {
    id: "src_1",
    user_id: "user_1",
    source_type: "whatsapp",
    external_id: "51999999999",
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
                const [channel, externalId] = values as [string, string];
                return (
                  channel === userSource.source_type && externalId === userSource.external_id
                    ? (user as T)
                    : null
                ) as T | null;
              }

              if (
                query.includes("from user_sources") &&
                query.includes("external_id as external_user_id")
              ) {
                const [userId, channel] = values as [string, string];
                return (
                  userId === user.id && channel === userSource.source_type
                    ? ({ external_user_id: userSource.external_id } as T)
                    : null
                ) as T | null;
              }

              if (
                query.includes("from user_sources") &&
                query.includes("select id, user_id, source_type, external_id, is_primary")
              ) {
                const [channel, externalId] = values as [string, string];
                return (
                  channel === userSource.source_type && externalId === userSource.external_id
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

describe("d1 user repo", () => {
  it("reads users from the MVP core users table when available", async () => {
    const repo = createD1UserRepo({ DB: createUserModelDbStub() } as never);

    const foundUser = await repo.getById("user_1");

    expect(foundUser).toEqual({
      id: "user_1",
      name: "David",
      status: "ACTIVE",
      defaultCurrency: "PEN",
      timezone: "America/Lima",
      locale: "es-PE",
      confidenceThreshold: 0.75,
      onboardingCompletedAt: null,
    });
  });

  it("resolves channel mappings from user_sources when available", async () => {
    const repo = createD1UserRepo({ DB: createUserModelDbStub() } as never);

    const foundUser = await repo.findByChannelExternalId({
      channel: "whatsapp",
      externalUserId: "51999999999",
    });

    expect(foundUser?.id).toBe("user_1");
    expect(foundUser?.name).toBe("David");
  });

  it("returns the primary external id from user_sources when available", async () => {
    const repo = createD1UserRepo({ DB: createUserModelDbStub() } as never);

    const externalUserId = await repo.getPrimaryExternalUserId({
      userId: "user_1",
      channel: "whatsapp",
    });

    expect(externalUserId).toBe("51999999999");
  });

  it("creates a channel mapping in user_sources when the MVP core table is available", async () => {
    const repo = createD1UserRepo({ DB: createUserModelDbStub() } as never);

    const mapping = await repo.createChannelMapping({
      userId: "user_1",
      channel: "whatsapp",
      externalUserId: "51999999999",
      isPrimary: true,
    });

    expect(mapping).toMatchObject({
      userId: "user_1",
      channel: "whatsapp",
      externalUserId: "51999999999",
      isPrimary: true,
    });
    expect(mapping.id).toBeTruthy();
  });
});
