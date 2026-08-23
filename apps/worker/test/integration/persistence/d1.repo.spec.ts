import { createTestEnv } from "test/helpers/fakes";
import { describe, expect, it } from "vitest";
import { createD1ExpenseRepo } from "@/adapters/persistence/d1/expense.repo";

describe("d1 expense repo integration", () => {
  it("creates and categorizes an expense", async () => {
    const env = createTestEnv();
    const repo = createD1ExpenseRepo(env);

    const created = await repo.createExpenseRecord({
      userId: "cust_default",
      amount: 23,
      currency: "PEN",
      merchant: "Metro",
      occurredAt: "2026-02-20T10:00:00.000Z",
      bank: "Interbank",
      rawText: "raw",
    });

    expect(created.status).toBe("needs_clarification");

    await repo.markConfirmed({
      id: created.id,
      userId: "cust_default",
      categoryId: "cat_food",
    });
    const updated = await repo.getById({ id: created.id, userId: "cust_default" });

    expect(updated?.status).toBe("confirmed");
    expect(updated?.categoryId).toBe("cat_food");
  });

  it("lists expenses by customer ordered newest first", async () => {
    const env = createTestEnv();
    const repo = createD1ExpenseRepo(env);

    await repo.createExpenseRecord({
      userId: "cust_default",
      amount: 10,
      currency: "PEN",
      merchant: "Old",
      occurredAt: "2026-02-20T10:00:00.000Z",
      bank: "Interbank",
      rawText: "old",
    });

    await repo.createExpenseRecord({
      userId: "cust_default",
      amount: 20,
      currency: "PEN",
      merchant: "New",
      occurredAt: "2026-02-21T10:00:00.000Z",
      bank: "Interbank",
      rawText: "new",
    });

    const expenses = await repo.listByUser({ userId: "cust_default" });

    expect(expenses).toHaveLength(2);
    expect(expenses[0]?.merchant).toBe("New");
    expect(expenses[1]?.merchant).toBe("Old");
  });

  it("updates and discards the latest expense", async () => {
    const env = createTestEnv();
    const repo = createD1ExpenseRepo(env);

    const created = await repo.createExpenseRecord({
      userId: "cust_default",
      amount: 23,
      currency: "PEN",
      merchant: "Metro",
      occurredAt: "2026-02-20T10:00:00.000Z",
      bank: "Interbank",
      rawText: "raw",
    });

    const latest = await repo.findLatestByUser({ userId: "cust_default" });
    expect(latest?.id).toBe(created.id);

    const updated = await repo.update({
      id: created.id,
      userId: "cust_default",
      amount: 30,
      currency: "PEN",
      merchant: "Tambo",
      occurredAt: "2026-02-21T10:00:00.000Z",
      rawText: "raw",
    });

    expect(updated).toMatchObject({
      id: created.id,
      amount: 30,
      merchant: "Tambo",
    });

    const discarded = await repo.discard({
      id: created.id,
      userId: "cust_default",
    });

    expect(discarded?.status).toBe("deleted");
    expect(await repo.findLatestByUser({ userId: "cust_default" })).toBeNull();
  });
});
