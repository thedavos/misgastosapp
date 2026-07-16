import { DEFAULT_CATEGORIES } from "@/domain/category/defaults";
import { getCurrencySymbol } from "@/utils/currencySymbol";

type NamedCategory = { name: string };

export function formatCategoryOptions(
  categories: ReadonlyArray<NamedCategory> = DEFAULT_CATEGORIES,
): string {
  return categories.map((category) => category.name).join(", ");
}

export function formatAskCategoryMessage(input: {
  amount?: number;
  currency?: string;
  merchant?: string;
  categories?: ReadonlyArray<NamedCategory>;
}): string {
  const options = formatCategoryOptions(input.categories ?? DEFAULT_CATEGORIES);
  const merchant = input.merchant?.trim() || "un comercio";

  if (input.amount !== undefined && input.currency) {
    const symbol = getCurrencySymbol(input.currency);
    return `Vi ${symbol} ${input.amount.toFixed(2)} en ${merchant}. ¿Qué categoría le pongo? (${options})`;
  }

  return `Vi un gasto en ${merchant}. ¿Qué categoría le pongo? (${options})`;
}

export function formatCategoryRetryMessage(
  categories: ReadonlyArray<NamedCategory> = DEFAULT_CATEGORIES,
): string {
  return `No me quedó clara la categoría. Opciones: ${formatCategoryOptions(categories)}.`;
}
