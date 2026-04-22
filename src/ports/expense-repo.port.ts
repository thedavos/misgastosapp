import type { Expense, NewExpense } from "@/domain/expense/entity";

export interface ExpenseRepoPort {
  createPending(input: NewExpense): Promise<Expense>;
  getById(input: { id: string; customerId: string }): Promise<Expense | null>;
  listByCustomer(input: { customerId: string }): Promise<Expense[]>;
  findLatestByCustomer(input: { customerId: string }): Promise<Expense | null>;
  update(input: {
    id: string;
    customerId: string;
    amount: number;
    currency: string;
    merchant: string;
    occurredAt: string;
    rawText: string;
  }): Promise<Expense | null>;
  discard(input: { id: string; customerId: string }): Promise<Expense | null>;
  markCategorized(input: { id: string; customerId: string; categoryId: string }): Promise<void>;
}
