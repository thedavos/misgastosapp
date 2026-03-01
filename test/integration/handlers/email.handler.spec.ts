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

  it("does not create expense when sender is not mapped", async () => {
    const env = createTestEnv({ emailSenders: [] });
    const message = makeMessage(
      "From: notificaciones@example.com\nSubject: Compra\n\nRealizaste una compra por S/ 50 en Tambo",
    );

    await handleEmail(message, env, {} as ExecutionContext);

    const dbState = (env.DB as unknown as {
      __state: { expenses: Map<string, { status: string; customer_id: string }> };
    }).__state;
    expect(dbState.expenses.size).toBe(0);
  });

  it("does not create expense when recipient inbox is not the worker inbox", async () => {
    const env = createTestEnv();
    const message = makeMessage(
      "From: notificaciones@example.com\nSubject: Compra\n\nRealizaste una compra por S/ 50 en Tambo",
    );
    message.to = "otro@misgastos.app";

    await handleEmail(message, env, {} as ExecutionContext);

    const dbState = (env.DB as unknown as {
      __state: { expenses: Map<string, { status: string; customer_id: string }> };
    }).__state;
    expect(dbState.expenses.size).toBe(0);
  });

  it("does not create expense when sender email is missing", async () => {
    const env = createTestEnv();
    const message = makeMessage(
      "Subject: Compra\n\nRealizaste una compra por S/ 50 en Tambo",
    );
    message.from = "";

    await handleEmail(message, env, {} as ExecutionContext);

    const dbState = (env.DB as unknown as {
      __state: { expenses: Map<string, { status: string; customer_id: string }> };
    }).__state;
    expect(dbState.expenses.size).toBe(0);
  });

  it("does not create expense when mapped customer does not exist", async () => {
    const env = createTestEnv({
      emailSenders: [
        {
          id: "sender_missing_customer",
          customer_id: "cust_missing",
          sender_email: "notificaciones@example.com",
          enabled: 1,
        },
      ],
    });
    const message = makeMessage(
      "From: notificaciones@example.com\nSubject: Compra\n\nRealizaste una compra por S/ 50 en Tambo",
    );

    await handleEmail(message, env, {} as ExecutionContext);

    const dbState = (env.DB as unknown as {
      __state: { expenses: Map<string, { status: string; customer_id: string }> };
    }).__state;
    expect(dbState.expenses.size).toBe(0);
  });

  it("does not create expense when mapped customer is inactive", async () => {
    const env = createTestEnv({
      customers: [
        {
          id: "cust_default",
          name: "Default Customer",
          status: "INACTIVE",
          default_currency: "PEN",
          timezone: "America/Lima",
          locale: "es-PE",
          confidence_threshold: 0.75,
        },
      ],
    });
    const message = makeMessage(
      "From: notificaciones@example.com\nSubject: Compra\n\nRealizaste una compra por S/ 50 en Tambo",
    );

    await handleEmail(message, env, {} as ExecutionContext);

    const dbState = (env.DB as unknown as {
      __state: { expenses: Map<string, { status: string; customer_id: string }> };
    }).__state;
    expect(dbState.expenses.size).toBe(0);
  });
});
