import { describe, expect, it, vi } from "vitest";
import { createExecuteMobileIntent } from "@/app/execute-mobile-intent";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";

describe("execute mobile intent", () => {
  it("creates an expense when mobile create_expense is directly executable", async () => {
    const createExpenseRecord = vi.fn().mockResolvedValue({
      id: "exp_1",
      userId: "cust_1",
      amount: 18,
      currency: "PEN",
      merchant: "Tambo",
      occurredAt: "2026-04-22T10:00:00.000Z",
      bank: "mobile",
      rawText: "S/ 18 en Tambo",
      status: "needs_clarification",
      categoryId: null,
      createdAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    });

    const executeMobileIntent = createExecuteMobileIntent({
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "create_expense",
        payload: {
          confidence: 0.95,
          missingFields: [],
          draft: {
            amountMinor: 1800,
            currency: "PEN",
            merchant: "Tambo",
            occurredAt: "2026-04-22T10:00:00.000Z",
          },
        },
      }),
      expenseRepo: {
        createExpenseRecord,
        getById: vi.fn(),
        listByUser: vi.fn(),
        findLatestByUser: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markConfirmed: vi.fn(),
      } as unknown as ExpenseRepoPort,
    });

    const result = await executeMobileIntent({
      userId: "cust_1",
      text: "S/ 18 en Tambo",
      timezone: "America/Lima",
      defaultCurrency: "PEN",
      nowIso: "2026-04-22T15:00:00.000Z",
    });

    expect(result.handled).toBe(true);
    expect(result.result.kind).toBe("expense_created");
    expect(createExpenseRecord).toHaveBeenCalledWith({
      userId: "cust_1",
      amount: 18,
      currency: "PEN",
      merchant: "Tambo",
      occurredAt: "2026-04-22T10:00:00.000Z",
      bank: "mobile",
      rawText: "S/ 18 en Tambo",
    });
  });

  it("returns a report payload when mobile get_report is directly executable", async () => {
    const executeMobileIntent = createExecuteMobileIntent({
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "get_report",
        payload: {
          confidence: 0.95,
          periodKind: "month",
        },
      }),
      expenseRepo: {
        createExpenseRecord: vi.fn(),
        getById: vi.fn(),
        listByUser: vi.fn().mockResolvedValue([
          {
            id: "exp_1",
            userId: "cust_1",
            amount: 18,
            currency: "PEN",
            merchant: "Tambo",
            occurredAt: "2026-04-22T10:00:00.000Z",
            bank: "mobile",
            rawText: "S/ 18 en Tambo",
            status: "needs_clarification",
            categoryId: null,
            createdAt: "2026-04-22T10:00:00.000Z",
            updatedAt: "2026-04-22T10:00:00.000Z",
          },
        ]),
        findLatestByUser: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markConfirmed: vi.fn(),
      } as unknown as ExpenseRepoPort,
    });

    const result = await executeMobileIntent({
      userId: "cust_1",
      text: "Resumen del mes",
      timezone: "America/Lima",
      defaultCurrency: "PEN",
      nowIso: "2026-04-22T15:00:00.000Z",
    });

    expect(result.handled).toBe(true);
    expect(result.result.kind).toBe("report_generated");
    expect(result.result.summary).toContain("Resumen de este mes:");
  });

  it("returns intent_not_executable when the parsed intent should not run directly", async () => {
    const executeMobileIntent = createExecuteMobileIntent({
      parseUserIntent: vi.fn().mockResolvedValue({
        name: "help",
        payload: {
          confidence: 0.99,
          topic: "examples",
        },
      }),
      expenseRepo: {
        createExpenseRecord: vi.fn(),
        getById: vi.fn(),
        listByUser: vi.fn(),
        findLatestByUser: vi.fn(),
        update: vi.fn(),
        discard: vi.fn(),
        markConfirmed: vi.fn(),
      } as unknown as ExpenseRepoPort,
    });

    const result = await executeMobileIntent({
      userId: "cust_1",
      text: "ayuda",
      timezone: "America/Lima",
      defaultCurrency: "PEN",
      nowIso: "2026-04-22T15:00:00.000Z",
    });

    expect(result).toEqual({
      handled: false,
      sourceType: "mobile",
      parsedIntent: {
        name: "help",
        payload: {
          confidence: 0.99,
          topic: "examples",
        },
      },
      error: "intent_not_executable",
    });
  });
});
