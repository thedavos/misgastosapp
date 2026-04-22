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

function normalizeExpenseStatus(status: string): Expense["status"] {
  switch (status) {
    case "PENDING_CATEGORY":
    case "NEEDS_CLARIFICATION":
    case "needs_clarification":
      return EXPENSE_STATUS.NeedsClarification;
    case "CATEGORIZED":
    case "CONFIRMED":
    case "confirmed":
      return EXPENSE_STATUS.Confirmed;
    case "DISCARDED":
    case "DELETED":
    case "deleted":
      return EXPENSE_STATUS.Deleted;
    default:
      return status as Expense["status"];
  }
}

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
    status: normalizeExpenseStatus(row.status),
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createD1ExpenseRepo(env: WorkerEnv): ExpenseRepoPort {
  return {
    async createExpenseRecord(input: NewExpense): Promise<Expense> {
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
          EXPENSE_STATUS.NeedsClarification,
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
        status: EXPENSE_STATUS.NeedsClarification,
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

    async listByCustomer(input: { customerId: string }): Promise<Expense[]> {
      const rows = await env.DB.prepare(
        `SELECT id, customer_id, amount, currency, merchant, occurred_at, bank, raw_text, status, category_id, created_at, updated_at
         FROM expenses
         WHERE customer_id = ? AND status NOT IN (?, ?, ?)
         ORDER BY occurred_at DESC, created_at DESC`,
      )
        .bind(input.customerId, EXPENSE_STATUS.Deleted, "DISCARDED", "DELETED")
        .all<ExpenseRow>();

      return rows.results.map(mapExpenseRow);
    },

    async findLatestByCustomer(input: { customerId: string }): Promise<Expense | null> {
      const row = await env.DB.prepare(
        `SELECT id, customer_id, amount, currency, merchant, occurred_at, bank, raw_text, status, category_id, created_at, updated_at
         FROM expenses
         WHERE customer_id = ? AND status NOT IN (?, ?, ?)
         ORDER BY created_at DESC
         LIMIT 1`,
      )
        .bind(input.customerId, EXPENSE_STATUS.Deleted, "DISCARDED", "DELETED")
        .first<ExpenseRow>();

      if (!row) return null;
      return mapExpenseRow(row);
    },

    async update(input: {
      id: string;
      customerId: string;
      amount: number;
      currency: string;
      merchant: string;
      occurredAt: string;
      rawText: string;
    }): Promise<Expense | null> {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE expenses
         SET amount = ?, currency = ?, merchant = ?, occurred_at = ?, raw_text = ?, updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
        .bind(
          input.amount,
          input.currency,
          input.merchant,
          input.occurredAt,
          input.rawText,
          now,
          input.id,
          input.customerId,
        )
        .run();

      await env.DB.prepare(
        `INSERT INTO expense_events (id, customer_id, expense_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          input.customerId,
          input.id,
          "EXPENSE_UPDATED",
          JSON.stringify({
            amount: input.amount,
            currency: input.currency,
            merchant: input.merchant,
            occurredAt: input.occurredAt,
          }),
          now,
        )
        .run();

      const row = await env.DB.prepare(
        `SELECT id, customer_id, amount, currency, merchant, occurred_at, bank, raw_text, status, category_id, created_at, updated_at
         FROM expenses WHERE id = ? AND customer_id = ? LIMIT 1`,
      )
        .bind(input.id, input.customerId)
        .first<ExpenseRow>();

      if (!row) return null;
      return mapExpenseRow(row);
    },

    async discard(input: { id: string; customerId: string }): Promise<Expense | null> {
      const existing = await env.DB.prepare(
        `SELECT id, customer_id, amount, currency, merchant, occurred_at, bank, raw_text, status, category_id, created_at, updated_at
         FROM expenses WHERE id = ? AND customer_id = ? LIMIT 1`,
      )
        .bind(input.id, input.customerId)
        .first<ExpenseRow>();

      if (!existing) return null;

      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE expenses
         SET status = ?, category_id = ?, updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
        .bind(EXPENSE_STATUS.Deleted, existing.category_id, now, input.id, input.customerId)
        .run();

      await env.DB.prepare(
        `INSERT INTO expense_events (id, customer_id, expense_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          input.customerId,
          input.id,
          "EXPENSE_DISCARDED",
          JSON.stringify({ previousStatus: existing.status }),
          now,
        )
        .run();

      return {
        ...mapExpenseRow(existing),
        status: EXPENSE_STATUS.Deleted,
        updatedAt: now,
      };
    },

    async markCategorized(input: {
      id: string;
      customerId: string;
      categoryId: string;
    }): Promise<void> {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE expenses
         SET status = ?, category_id = ?, updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
        .bind(EXPENSE_STATUS.Confirmed, input.categoryId, now, input.id, input.customerId)
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
