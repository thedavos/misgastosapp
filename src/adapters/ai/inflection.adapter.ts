import type { AiPort, CategoryClassificationInput, ExtractedTransaction, MessageGenerationInput } from "@/ports/ai.port";

export type InflectionClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export function createInflectionAiAdapter(config: InflectionClientConfig): AiPort {
  return {
    async extractTransaction(_input: string): Promise<ExtractedTransaction | null> {
      if (!config.apiKey || !config.baseUrl) return null;
      return null;
    },
    async classifyCategory(_input: CategoryClassificationInput): Promise<{ categoryId: string | null; confidence: number }> {
      if (!config.apiKey || !config.baseUrl) return { categoryId: null, confidence: 0 };
      return { categoryId: null, confidence: 0 };
    },
    async generateMessage(input: MessageGenerationInput): Promise<string> {
      if (input.kind === "ask_category") {
        return "Hola, ¿qué categoría le ponemos a este gasto?";
      }
      return "¡Listo! Ya quedó registrado.";
    },
  };
}
