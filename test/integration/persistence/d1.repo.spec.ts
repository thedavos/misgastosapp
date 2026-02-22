import { describe, expect, it } from "vitest";
import { createD1ExpenseRepo } from "@/adapters/persistence/d1/expense.repo";
import { createTestEnv } from "test/helpers/fakes";

describe("d1 expense repo integration", () => {
  it("creates and categorizes an expense", async () => {
    const env = createTestEnv();
    const repo = createD1ExpenseRepo(env);

    const created = await repo.createPending({
      customerId: "cust_default",
      amount: 23,
      currency: "PEN",
      merchant: "Metro",
      occurredAt: "2026-02-20T10:00:00.000Z",
      bank: "Interbank",
      rawText: "raw",
    });

    expect(created.status).toBe("PENDING_CATEGORY");

    await repo.markCategorized({ id: created.id, customerId: "cust_default", categoryId: "cat_food" });
    const updated = await repo.getById({ id: created.id, customerId: "cust_default" });

    expect(updated?.status).toBe("CATEGORIZED");
    expect(updated?.categoryId).toBe("cat_food");
  });
});
