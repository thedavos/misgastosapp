import { describe, expect, it, vi } from "vitest";
import { resolveMobileIntentRequest } from "@/handlers/http/mobile-intent-request";
import type { UserRepoPort } from "@/ports/user-repo.port";

const ACTIVE_USER = {
  id: "cust_1",
  name: "David",
  status: "ACTIVE" as const,
  defaultCurrency: "PEN",
  timezone: "America/Lima",
  locale: "es-PE",
  confidenceThreshold: 0.8,
  onboardingCompletedAt: null,
};

const TOKENS = JSON.stringify({ "test-mobile-token": "cust_1" });

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function userRepo(overrides?: Partial<UserRepoPort>): UserRepoPort {
  return {
    getById: vi.fn(),
    findByChannelExternalId: vi.fn(),
    findOrCreateByChannelExternalId: vi.fn(),
    getPrimaryExternalUserId: vi.fn(),
    createChannelMapping: vi.fn(),
    markOnboardingCompleted: vi.fn(),
    ...overrides,
  } as unknown as UserRepoPort;
}

describe("resolve mobile intent request", () => {
  it("returns unauthorized when Authorization is missing", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest({ text: "hola" }),
      userRepo: userRepo(),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected unauthorized");
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns unauthorized when Authorization token is invalid", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest({ text: "hola" }, { authorization: "Bearer wrong-token" }),
      userRepo: userRepo(),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected unauthorized");
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns invalid_json when the body is not valid json", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest("{", { authorization: "Bearer test-mobile-token" }),
      userRepo: userRepo(),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected invalid_json result");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "invalid_json" });
  });

  it("returns text_required when text is missing", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest({ userId: "cust_1" }, { authorization: "Bearer test-mobile-token" }),
      userRepo: userRepo(),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected text_required");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "text_required" });
  });

  it("returns forbidden when body userId mismatches authenticated principal", async () => {
    const getById = vi.fn();
    const result = await resolveMobileIntentRequest({
      request: makeRequest(
        { userId: "cust_other", text: "hola" },
        { authorization: "Bearer test-mobile-token" },
      ),
      userRepo: userRepo({ getById }),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected forbidden");
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ error: "forbidden" });
    expect(getById).not.toHaveBeenCalled();
  });

  it("returns unauthorized when authenticated principal is unknown", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest({ text: "hola" }, { authorization: "Bearer test-mobile-token" }),
      userRepo: userRepo({ getById: vi.fn().mockResolvedValue(null) }),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected unauthorized for unknown principal");
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns forbidden when authenticated user is inactive", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest({ text: "hola" }, { authorization: "Bearer test-mobile-token" }),
      userRepo: userRepo({
        getById: vi.fn().mockResolvedValue({
          ...ACTIVE_USER,
          status: "INACTIVE",
        }),
      }),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected forbidden for inactive user");
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ error: "forbidden" });
  });

  it("returns normalized request data when auth and payload are valid", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest(
        { text: " S/ 18 en Tambo " },
        { authorization: "Bearer test-mobile-token" },
      ),
      userRepo: userRepo({ getById: vi.fn().mockResolvedValue(ACTIVE_USER) }),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success result");
    expect(result.value).toEqual({
      userId: "cust_1",
      text: "S/ 18 en Tambo",
      user: ACTIVE_USER,
    });
  });

  it("accepts matching body userId without changing principal identity", async () => {
    const result = await resolveMobileIntentRequest({
      request: makeRequest(
        { userId: "cust_1", text: "hola" },
        { authorization: "Bearer test-mobile-token" },
      ),
      userRepo: userRepo({ getById: vi.fn().mockResolvedValue(ACTIVE_USER) }),
      mobileApiTokens: TOKENS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.value.userId).toBe("cust_1");
  });
});
