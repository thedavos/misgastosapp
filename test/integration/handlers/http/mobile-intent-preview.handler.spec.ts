import { createTestEnv } from "test/helpers/fakes";
import { describe, expect, it } from "vitest";
import { handleFetch } from "@/handlers/http/router.handler";

describe("mobile intent preview handler integration", () => {
  it("returns a parsed intent preview for mobile input", async () => {
    const env = createTestEnv();

    const response = await handleFetch(
      new Request("https://example.com/api/mobile/intents/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          customerId: "cust_default",
          text: "S/ 18 en Tambo",
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.sourceType).toBe("mobile");
    expect(payload.parsedIntent.name).toBe("create_expense");
  });
});
