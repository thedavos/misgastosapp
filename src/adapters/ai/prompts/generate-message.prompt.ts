import type { MessageGenerationInput } from "@/ports/ai.port";

export function buildGenerateMessagePrompt(input: MessageGenerationInput): string {
  if (input.kind === "ask_category") {
    return `Genera un mensaje breve y empatico en español para pedir categoria del gasto.
Monto: ${input.currency ?? ""} ${input.amount ?? ""}
Comercio: ${input.merchant ?? ""}`;
  }

  return `Genera un mensaje breve y empatico en español confirmando categorizacion.
Categoria: ${input.categoryName ?? ""}`;
}
