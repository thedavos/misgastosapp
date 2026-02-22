import type { WorkerEnv } from "types/env";
import type { Expense, NewExpense } from "@/domain/expense/entity";
import { EXPENSE_STATUS } from "@/domain/expense/status";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";

type ExpenseRow = {
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
};

function mapExpenseRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    customerId: row.customer_id,
    amount: row.amount,
    currency: row.currency,
    merchant: row.merchant,
    occurredAt: row.occurred_at,
    bank: row.bank,
    rawText: row.raw_text,
    status: row.status as Expense["status"],
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createD1ExpenseRepo(env: WorkerEnv): ExpenseRepoPort {
  return {
    async createPending(input: NewExpense): Promise<Expense> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO expenses (id, customer_id, amount, currency, merchant, occurred_at, bank, raw_text, status, category_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
        .bind(
          id,
          input.customerId,
          input.amount,
          input.currency,
          input.merchant,
          input.occurredAt,
          input.bank,
          input.rawText,
          EXPENSE_STATUS.PendingCategory,
          now,
          now,
        )
        .run();

      return {
        id,
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency,
        merchant: input.merchant,
        occurredAt: input.occurredAt,
        bank: input.bank,
        rawText: input.rawText,
        status: EXPENSE_STATUS.PendingCategory,
        categoryId: null,
        createdAt: now,
        updatedAt: now,
      };
    },

    async getById(input: { id: string; customerId: string }): Promise<Expense | null> {
      const row = await env.DB.prepare(
        `SELECT id, customer_id, amount, currency, merchant, occurred_at, bank, raw_text, status, category_id, created_at, updated_at
         FROM expenses WHERE id = ? AND customer_id = ? LIMIT 1`,
      )
        .bind(input.id, input.customerId)
        .first<ExpenseRow>();

      if (!row) return null;
      return mapExpenseRow(row);
    },

    async markCategorized(input: { id: string; customerId: string; categoryId: string }): Promise<void> {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE expenses
         SET status = ?, category_id = ?, updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
        .bind(EXPENSE_STATUS.Categorized, input.categoryId, now, input.id, input.customerId)
        .run();

      await env.DB.prepare(
        `INSERT INTO expense_events (id, customer_id, expense_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          input.customerId,
          input.id,
          "EXPENSE_CATEGORIZED",
          JSON.stringify({ categoryId: input.categoryId }),
          now,
        )
        .run();
    },
  };
}
