import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { KVNamespace } from "@cloudflare/workers-types";
import { generateObject, jsonSchema } from "ai";
import {
  CLASSIFICATION_SCHEMA,
  PARSED_TRANSACTION_SCHEMA,
  generateDeterministicMessage,
  normalizeClassification,
  normalizeExtracted,
  tryHeuristicCategory,
} from "@/adapters/ai/adapter.shared";
import { buildClassifyCategoryPrompt } from "@/adapters/ai/prompts/classify-category.prompt";
import { buildExtractTransactionPrompt } from "@/adapters/ai/prompts/extract-transaction.prompt";
import type {
  AiCallScope,
  AiPort,
  CategoryClassificationInput,
  ExtractedTransaction,
  MessageGenerationInput,
} from "@/ports/ai.port";

export type OpenAiCompatibleGatewayConfig = {
  /** Provider label sent with requests, e.g. "vercel-ai" or "openrouter" */
  providerName: string;
  apiKey?: string;
  baseURL: string;
  modelId: string;
  promptsKv: KVNamespace;
  headers?: Record<string, string>;
};

const DEFAULT_SYSTEM_PROMPT = "Eres un extractor preciso de transacciones financieras.";
const CLASSIFY_SYSTEM_PROMPT =
  "Clasifica texto financiero en categorias usando solo opciones disponibles.";

export function createOpenAiCompatibleAiAdapter(config: OpenAiCompatibleGatewayConfig): AiPort {
  const provider = createOpenAICompatible({
    name: config.providerName,
    apiKey: config.apiKey ?? "",
    baseURL: config.baseURL,
    ...(config.headers ? { headers: config.headers } : {}),
  });
  const model = provider.chatModel(config.modelId);

  return {
    async extractTransaction(
      input: string,
      _scope?: AiCallScope,
    ): Promise<ExtractedTransaction | null> {
      const systemPrompt = (await config.promptsKv.get("SYSTEM_PROMPT")) ?? DEFAULT_SYSTEM_PROMPT;

      const { object } = await generateObject({
        model,
        schema: jsonSchema(PARSED_TRANSACTION_SCHEMA),
        system: systemPrompt,
        prompt: buildExtractTransactionPrompt(JSON.stringify(PARSED_TRANSACTION_SCHEMA), input),
      });
      return normalizeExtracted(object, input);
    },

    async classifyCategory(
      input: CategoryClassificationInput,
      _scope?: AiCallScope,
    ): Promise<{ categoryId: string | null; confidence: number }> {
      const heuristic = tryHeuristicCategory(input);
      if (heuristic.categoryId) return heuristic;

      const { object } = await generateObject({
        model,
        schema: jsonSchema(CLASSIFICATION_SCHEMA),
        system: CLASSIFY_SYSTEM_PROMPT,
        prompt: buildClassifyCategoryPrompt(input),
      });
      return normalizeClassification(object);
    },

    async generateMessage(input: MessageGenerationInput, _scope?: AiCallScope): Promise<string> {
      return generateDeterministicMessage(input);
    },
  };
}
