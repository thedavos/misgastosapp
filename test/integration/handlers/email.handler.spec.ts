import { describe, expect, it } from "vitest";
import { handleEmail } from "@/handlers/email.handler";
import { makeMessage } from "@/utils/makeMessage";
import { createTestEnv } from "test/helpers/fakes";

describe("email handler integration", () => {
  it("creates pending expense and conversation state", async () => {
    const env = createTestEnv();
    const message = makeMessage(
      "From: notificaciones@example.com\nSubject: Compra\n\nRealizaste una compra por S/ 50 en Tambo",
    );

    await handleEmail(message, env, {} as ExecutionContext);

    const dbState = (env.DB as unknown as {
      __state: { expenses: Map<string, { status: string; customer_id: string }> };
    }).__state;
    expect(dbState.expenses.size).toBe(1);

    const expense = Array.from(dbState.expenses.values())[0];
    expect(expense.status).toBe("PENDING_CATEGORY");
    expect(expense.customer_id).toBe("cust_default");

    const conversation = await env.CONVERSATION_STATE_KV.get("conv:cust_default:whatsapp:51999999999");
    expect(conversation).toBeTruthy();
  });
});
