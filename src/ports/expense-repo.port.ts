import type { Expense, NewExpense } from "@/domain/expense/entity";

export interface ExpenseRepoPort {
  createPending(input: NewExpense): Promise<Expense>;
  getById(input: { id: string; customerId: string }): Promise<Expense | null>;
  markCategorized(input: { id: string; customerId: string; categoryId: string }): Promise<void>;
}
