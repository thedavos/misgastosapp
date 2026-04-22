import { describe, expect, it, vi } from "vitest";
import { resolveMobileIntentRequest } from "@/handlers/http/mobile-intent-request";
import type { CustomerRepoPort } from "@/ports/customer-repo.port";

describe("resolve mobile intent request", () => {
  it("returns invalid_json when the body is not valid json", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });

    const result = await resolveMobileIntentRequest({
      request,
      customerRepo: {
        getById: vi.fn(),
        findByChannelExternalId: vi.fn(),
        getPrimaryExternalUserId: vi.fn(),
        createChannelMapping: vi.fn(),
      } as unknown as CustomerRepoPort,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected invalid_json result");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "invalid_json" });
  });

  it("returns customerId_and_text_required when required fields are missing", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ customerId: "cust_1" }),
    });

    const result = await resolveMobileIntentRequest({
      request,
      customerRepo: {
        getById: vi.fn(),
        findByChannelExternalId: vi.fn(),
        getPrimaryExternalUserId: vi.fn(),
        createChannelMapping: vi.fn(),
      } as unknown as CustomerRepoPort,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected missing fields result");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "customerId_and_text_required" });
  });

  it("returns customer_not_found when the customer does not exist", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ customerId: "cust_missing", text: "hola" }),
    });

    const result = await resolveMobileIntentRequest({
      request,
      customerRepo: {
        getById: vi.fn().mockResolvedValue(null),
        findByChannelExternalId: vi.fn(),
        getPrimaryExternalUserId: vi.fn(),
        createChannelMapping: vi.fn(),
      } as unknown as CustomerRepoPort,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected customer_not_found result");
    expect(result.response.status).toBe(404);
    expect(await result.response.json()).toEqual({ error: "customer_not_found" });
  });

  it("returns normalized request data when the payload is valid", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ customerId: " cust_1 ", text: " S/ 18 en Tambo " }),
    });

    const result = await resolveMobileIntentRequest({
      request,
      customerRepo: {
        getById: vi.fn().mockResolvedValue({
          id: "cust_1",
          name: "David",
          status: "ACTIVE",
          defaultCurrency: "PEN",
          timezone: "America/Lima",
          locale: "es-PE",
          confidenceThreshold: 0.8,
        }),
        findByChannelExternalId: vi.fn(),
        getPrimaryExternalUserId: vi.fn(),
        createChannelMapping: vi.fn(),
      } as unknown as CustomerRepoPort,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success result");
    expect(result.value).toEqual({
      customerId: "cust_1",
      text: "S/ 18 en Tambo",
      customer: {
        id: "cust_1",
        name: "David",
        status: "ACTIVE",
        defaultCurrency: "PEN",
        timezone: "America/Lima",
        locale: "es-PE",
        confidenceThreshold: 0.8,
      },
    });
  });
});
