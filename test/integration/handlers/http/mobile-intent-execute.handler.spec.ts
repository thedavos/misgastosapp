import { createTestEnv } from "test/helpers/fakes";
import { describe, expect, it } from "vitest";
import { handleFetch } from "@/handlers/http/router.handler";

describe("mobile intent execute handler integration", () => {
  it("rejects missing authentication", async () => {
    const env = createTestEnv();

    const response = await handleFetch(
      new Request("https://example.com/api/mobile/intents/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: "S/ 18 en Tambo",
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects cross-user body identity", async () => {
    const env = createTestEnv();

    const response = await handleFetch(
      new Request("https://example.com/api/mobile/intents/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-mobile-token",
        },
        body: JSON.stringify({
          userId: "cust_other",
          text: "S/ 18 en Tambo",
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("creates an expense directly for mobile create_expense input", async () => {
    const env = createTestEnv();

    const response = await handleFetch(
      new Request("https://example.com/api/mobile/intents/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-mobile-token",
        },
        body: JSON.stringify({
          text: "S/ 18 en Tambo",
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.handled).toBe(true);
    expect(payload.result.kind).toBe("expense_created");
    expect(payload.result.expense.merchant).toBe("Tambo");
  });

  it("returns a generated report for mobile report input", async () => {
    const env = createTestEnv();
    const nowIso = new Date().toISOString();
    const dbState = (
      env.DB as unknown as {
        __state: {
          expenses: Map<
            string,
            {
              id: string;
              customer_id: string;
              amount: number;
              currency: string;
              merchant: string;
              occurred_at: string;
              bank: string;
              raw_text: string;
              status: string;
              category_id: string | null;
              created_at: string;
              updated_at: string;
            }
          >;
        };
      }
    ).__state;

    dbState.expenses.set("exp_1", {
      id: "exp_1",
      customer_id: "cust_default",
      amount: 18,
      currency: "PEN",
      merchant: "Tambo",
      occurred_at: nowIso,
      bank: "mobile",
      raw_text: "x",
      status: "needs_clarification",
      category_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const response = await handleFetch(
      new Request("https://example.com/api/mobile/intents/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-mobile-token",
        },
        body: JSON.stringify({
          text: "Resumen del mes",
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.handled).toBe(true);
    expect(payload.result.kind).toBe("report_generated");
    expect(payload.result.summary).toContain("Resumen de este mes:");
  });
});
