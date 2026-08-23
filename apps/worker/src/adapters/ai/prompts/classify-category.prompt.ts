import type { CategoryClassificationInput } from "@/ports/ai.port";

export function buildClassifyCategoryPrompt(input: CategoryClassificationInput): string {
  const categoriesList = input.categories.map((c) => `- ${c.id}: ${c.name} (${c.slug})`).join("\n");

  return `Clasifica la respuesta del usuario a una categoria existente.
Devuelve JSON valido con: {"categoryId": string | null, "confidence": number}.
confidence debe estar entre 0 y 1.
Si no hay match claro, categoryId debe ser null.

Categorias disponibles:
${categoriesList}

Respuesta del usuario:
${input.userReply}`;
}
