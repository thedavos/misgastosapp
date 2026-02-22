export function isValidExpenseCandidate(input: {
  amount: number;
  currency: string;
  merchant: string;
}): boolean {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return false;
  if (!input.currency || input.currency.trim().length < 3) return false;
  if (!input.merchant || input.merchant.trim().length < 2) return false;
  return true;
}
