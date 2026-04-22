export const EXPENSE_STATUS = {
  NeedsClarification: "needs_clarification",
  Confirmed: "confirmed",
  Deleted: "deleted",
} as const;

export type ExpenseStatus = (typeof EXPENSE_STATUS)[keyof typeof EXPENSE_STATUS];
