import type { Expense, NewExpense } from "@/domain/expense/entity";

export interface ExpenseRepoPort {
  createExpenseRecord(input: NewExpense): Promise<Expense>;
  getById(input: { id: string; userId: string }): Promise<Expense | null>;
  listByUser(input: { userId: string }): Promise<Expense[]>;
  findLatestByUser(input: { userId: string }): Promise<Expense | null>;
  update(input: {
    id: string;
    userId: string;
    amount: number;
    currency: string;
    merchant: string;
    occurredAt: string;
    rawText: string;
  }): Promise<Expense | null>;
  discard(input: { id: string; userId: string }): Promise<Expense | null>;
  markConfirmed(input: { id: string; userId: string; categoryId: string }): Promise<void>;
}
