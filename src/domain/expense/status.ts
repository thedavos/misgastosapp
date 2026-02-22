export const EXPENSE_STATUS = {
  PendingCategory: "PENDING_CATEGORY",
  Categorized: "CATEGORIZED",
  Discarded: "DISCARDED",
} as const;

export type ExpenseStatus = (typeof EXPENSE_STATUS)[keyof typeof EXPENSE_STATUS];
