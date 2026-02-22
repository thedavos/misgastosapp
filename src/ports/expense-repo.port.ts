import type { Expense, NewExpense } from "@/domain/expense/entity";

export interface ExpenseRepoPort {
  createPending(input: NewExpense): Promise<Expense>;
  getById(id: string): Promise<Expense | null>;
  markCategorized(input: { id: string; categoryId: string }): Promise<void>;
}
