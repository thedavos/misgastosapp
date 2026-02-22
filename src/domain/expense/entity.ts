import type { ExpenseStatus } from "@/domain/expense/status";

export interface Expense {
  id: string;
  customerId: string;
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
  customerId: string;
  amount: number;
  currency: string;
  merchant: string;
  occurredAt: string;
  bank: string;
  rawText: string;
}
