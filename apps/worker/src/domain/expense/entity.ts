import type { ExpenseStatus } from "@/domain/expense/status";

export interface Expense {
  id: string;
  userId: string;
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
  createdVia?: "whatsapp" | "email" | "mobile" | "telegram";
  sourceMessageId?: string | null;
}

export interface NewExpense {
  userId: string;
  amount: number;
  currency: string;
  merchant: string;
  occurredAt: string;
  bank: string;
  rawText: string;
  createdVia?: "whatsapp" | "email" | "mobile" | "telegram";
  sourceMessageId?: string | null;
}
