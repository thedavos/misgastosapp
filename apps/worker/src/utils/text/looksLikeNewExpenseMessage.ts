/**
 * Detects expense-shaped chat replies (amount + currency markers).
 * Used to avoid treating a new expense as a category answer while awaiting_category.
 *
 * Examples that match: "20 soles metro hoy", "S/. 25 en Tambo", "USD 10 uber"
 * Examples that do not: "Comida", "Transporte", "1", "tal vez"
 */
export function looksLikeNewExpenseMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  const hasCurrencyAmount =
    /(?:^|\s)(?:s\/\.?|\$)\s*\d+(?:[.,]\d{1,2})?(?:\s|$)/i.test(normalized) ||
    /(?:^|\s)\d+(?:[.,]\d{1,2})?\s*(?:soles?|pen|usd|eur)(?:\s|$)/i.test(normalized) ||
    /(?:^|\s)(?:soles?|pen|usd|eur)\s*\d+(?:[.,]\d{1,2})?(?:\s|$)/i.test(normalized);

  if (!hasCurrencyAmount) return false;

  // Require at least amount + another token (merchant, place, or date cue).
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.length >= 2;
}
