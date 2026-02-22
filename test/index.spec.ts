import { describe, expect, it } from "vitest";
import { handleFetch } from "@/handlers/http/router.handler";
import { createTestEnv } from "test/helpers/fakes";

describe("worker router", () => {
  it("returns health response", async () => {
    const env = createTestEnv();
    const response = await handleFetch(new Request("https://example.com/health"), env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("MisGastos Worker Active - v2.0");
  });

  it("returns not found for unknown route", async () => {
    const env = createTestEnv();
    const response = await handleFetch(new Request("https://example.com/"), env, {} as ExecutionContext);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("returns method not allowed for webhook GET routes", async () => {
    const env = createTestEnv();
    const response = await handleFetch(
      new Request("https://example.com/webhooks/whatsapp", { method: "GET" }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });
});
