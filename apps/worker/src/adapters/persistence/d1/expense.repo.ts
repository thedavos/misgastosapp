import type { WorkerEnv } from "types/env";
import type { Expense, NewExpense } from "@/domain/expense/entity";
import { EXPENSE_STATUS } from "@/domain/expense/status";
import type { ExpenseRepoPort } from "@/ports/expense-repo.port";

type TransactionRow = {
  id: string;
  user_id: string;
  source_message_id: string | null;
  amount_minor: number;
  currency: string;
  merchant: string;
  description: string | null;
  category_id: string | null;
  occurred_at: string;
  status: string;
  created_via: string;
  created_at: string;
  updated_at: string;
};

type StoredTransactionDescription = {
  rawText: string;
  bank: string;
};

function parseStoredDescription(description: string | null): StoredTransactionDescription {
  if (!description) {
    return { rawText: "", bank: "unknown" };
  }

  try {
    const parsed = JSON.parse(description) as Partial<StoredTransactionDescription>;
    if (typeof parsed.rawText === "string" || typeof parsed.bank === "string") {
      return {
        rawText: typeof parsed.rawText === "string" ? parsed.rawText : description,
        bank: typeof parsed.bank === "string" ? parsed.bank : "unknown",
      };
    }
  } catch {
    // fall through to plain-text handling
  }

  return { rawText: description, bank: "unknown" };
}

function buildStoredDescription(input: { rawText: string; bank: string }): string {
  return JSON.stringify({ rawText: input.rawText, bank: input.bank });
}

function mapTransactionRow(row: TransactionRow): Expense {
  const description = parseStoredDescription(row.description);

  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount_minor / 100,
    currency: row.currency,
    merchant: row.merchant,
    occurredAt: row.occurred_at,
    bank: description.bank,
    rawText: description.rawText,
    status: row.status as Expense["status"],
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdVia: row.created_via as Expense["createdVia"],
    sourceMessageId: row.source_message_id,
  };
}

export function createD1ExpenseRepo(env: WorkerEnv): ExpenseRepoPort {
  return {
    async createExpenseRecord(input: NewExpense): Promise<Expense> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const amountMinor = Math.round(input.amount * 100);
      const createdVia = input.createdVia ?? "whatsapp";
      const sourceMessageId = input.sourceMessageId ?? null;
      const description = buildStoredDescription({
        rawText: input.rawText,
        bank: input.bank,
      });

      await env.DB.prepare(
        `INSERT INTO transactions (
           id,
           user_id,
           source_message_id,
           amount_minor,
           currency,
           merchant,
           description,
           category_id,
           occurred_at,
           status,
           created_via,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          input.userId,
          sourceMessageId,
          amountMinor,
          input.currency,
          input.merchant,
          description,
          input.occurredAt,
          EXPENSE_STATUS.NeedsClarification,
          createdVia,
          now,
          now,
        )
        .run();

      await env.DB.prepare(
        `INSERT INTO transaction_revisions (
           id,
           transaction_id,
           user_id,
           revision_type,
           before_json,
           after_json,
           reason,
           created_at
         ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          id,
          input.userId,
          "created",
          JSON.stringify({
            amountMinor,
            currency: input.currency,
            merchant: input.merchant,
            description,
            occurredAt: input.occurredAt,
            status: EXPENSE_STATUS.NeedsClarification,
            createdVia,
          }),
          createdVia,
          now,
        )
        .run();

      return {
        id,
        userId: input.userId,
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
        createdVia,
        sourceMessageId,
      };
    },

    async getById(input: { id: string; userId: string }): Promise<Expense | null> {
      const row = await env.DB.prepare(
        `SELECT id, user_id, source_message_id, amount_minor, currency, merchant, description,
                category_id, occurred_at, status, created_via, created_at, updated_at
         FROM transactions
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
      )
        .bind(input.id, input.userId)
        .first<TransactionRow>();

      if (!row) return null;
      return mapTransactionRow(row);
    },

    async listByUser(input: { userId: string }): Promise<Expense[]> {
      const rows = await env.DB.prepare(
        `SELECT id, user_id, source_message_id, amount_minor, currency, merchant, description,
                category_id, occurred_at, status, created_via, created_at, updated_at
         FROM transactions
         WHERE user_id = ? AND status != ?
         ORDER BY occurred_at DESC, created_at DESC`,
      )
        .bind(input.userId, EXPENSE_STATUS.Deleted)
        .all<TransactionRow>();

      return rows.results.map(mapTransactionRow);
    },

    async findLatestByUser(input: { userId: string }): Promise<Expense | null> {
      const row = await env.DB.prepare(
        `SELECT id, user_id, source_message_id, amount_minor, currency, merchant, description,
                category_id, occurred_at, status, created_via, created_at, updated_at
         FROM transactions
         WHERE user_id = ? AND status != ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
        .bind(input.userId, EXPENSE_STATUS.Deleted)
        .first<TransactionRow>();

      if (!row) return null;
      return mapTransactionRow(row);
    },

    async update(input: {
      id: string;
      userId: string;
      amount: number;
      currency: string;
      merchant: string;
      occurredAt: string;
      rawText: string;
    }): Promise<Expense | null> {
      const existing = await env.DB.prepare(
        `SELECT id, user_id, source_message_id, amount_minor, currency, merchant, description,
                category_id, occurred_at, status, created_via, created_at, updated_at
         FROM transactions
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
      )
        .bind(input.id, input.userId)
        .first<TransactionRow>();

      if (!existing) return null;

      const now = new Date().toISOString();
      const previous = mapTransactionRow(existing);
      const description = buildStoredDescription({
        rawText: input.rawText,
        bank: previous.bank,
      });

      await env.DB.prepare(
        `UPDATE transactions
         SET amount_minor = ?, currency = ?, merchant = ?, occurred_at = ?, description = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
        .bind(
          Math.round(input.amount * 100),
          input.currency,
          input.merchant,
          input.occurredAt,
          description,
          now,
          input.id,
          input.userId,
        )
        .run();

      await env.DB.prepare(
        `INSERT INTO transaction_revisions (
           id,
           transaction_id,
           user_id,
           revision_type,
           before_json,
           after_json,
           reason,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          input.id,
          input.userId,
          "updated",
          JSON.stringify(previous),
          JSON.stringify({
            ...previous,
            amount: input.amount,
            currency: input.currency,
            merchant: input.merchant,
            occurredAt: input.occurredAt,
            rawText: input.rawText,
            updatedAt: now,
          }),
          "user_update",
          now,
        )
        .run();

      return this.getById({ id: input.id, userId: input.userId });
    },

    async discard(input: { id: string; userId: string }): Promise<Expense | null> {
      const existing = await this.getById({ id: input.id, userId: input.userId });
      if (!existing) return null;

      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE transactions
         SET status = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
        .bind(EXPENSE_STATUS.Deleted, now, input.id, input.userId)
        .run();

      await env.DB.prepare(
        `INSERT INTO transaction_revisions (
           id,
           transaction_id,
           user_id,
           revision_type,
           before_json,
           after_json,
           reason,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          input.id,
          input.userId,
          "deleted",
          JSON.stringify(existing),
          JSON.stringify({ ...existing, status: EXPENSE_STATUS.Deleted, updatedAt: now }),
          "user_delete",
          now,
        )
        .run();

      return {
        ...existing,
        status: EXPENSE_STATUS.Deleted,
        updatedAt: now,
      };
    },

    async markConfirmed(input: { id: string; userId: string; categoryId: string }): Promise<void> {
      const existing = await this.getById({ id: input.id, userId: input.userId });
      if (!existing) return;

      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE transactions
         SET status = ?, category_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
        .bind(EXPENSE_STATUS.Confirmed, input.categoryId, now, input.id, input.userId)
        .run();

      await env.DB.prepare(
        `INSERT INTO transaction_revisions (
           id,
           transaction_id,
           user_id,
           revision_type,
           before_json,
           after_json,
           reason,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          input.id,
          input.userId,
          "confirmed",
          JSON.stringify(existing),
          JSON.stringify({
            ...existing,
            status: EXPENSE_STATUS.Confirmed,
            categoryId: input.categoryId,
            updatedAt: now,
          }),
          "category_confirmation",
          now,
        )
        .run();
    },
  };
}
