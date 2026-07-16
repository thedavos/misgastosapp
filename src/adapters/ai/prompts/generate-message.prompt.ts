import { formatAskCategoryMessage, formatCategoryOptions } from "@/app/ask-category-message";
import { DEFAULT_CATEGORIES } from "@/domain/category/defaults";
import type { MessageGenerationInput } from "@/ports/ai.port";

export function buildGenerateMessagePrompt(input: MessageGenerationInput): string {
  if (input.kind === "ask_category") {
    const categories = input.categories?.length ? input.categories : [...DEFAULT_CATEGORIES];
    return `Genera un mensaje breve y empatico en español para pedir categoria del gasto.
Debe mencionar las opciones disponibles.
Plantilla de referencia: ${formatAskCategoryMessage({
      amount: input.amount,
      currency: input.currency,
      merchant: input.merchant,
      categories,
    })}
Monto: ${input.currency ?? ""} ${input.amount ?? ""}
Comercio: ${input.merchant ?? ""}
Categorias: ${formatCategoryOptions(categories)}`;
  }

  return `Genera un mensaje breve y empatico en español confirmando categorizacion.
Categoria: ${input.categoryName ?? ""}`;
}
