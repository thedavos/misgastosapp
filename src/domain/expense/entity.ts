import type { ExpenseStatus } from "@/domain/expense/status";

export interface Expense {
  id: string;
  amount: number;
  currency: string;
  merchant: string;
  occurredAt: string;
  bank: string;
  rawText: string;
  status: ExpenseStatus;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewExpense {
  amount: number;
  currency: string;
  merchant: string;
  occurredAt: string;
  bank: string;
  rawText: string;
}
