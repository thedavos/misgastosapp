import type { Email } from "postal-mime";
import type { WorkerEnv } from "types/env";
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

const AI_MAX_INPUT_CHARS = 6000;

function buildEmailContext(parsedEmail: Email): string {
  const lines: string[] = [];
  lines.push(`From: ${parsedEmail.from?.address ?? ""}`);
  lines.push(`To: ${parsedEmail.to?.map((t) => t.address).join(",") ?? ""}`);
  lines.push(`Subject: ${parsedEmail.subject ?? ""}`);
  lines.push(`Date: ${String(parsedEmail.date || "")}`);
  if (parsedEmail.text) {
    lines.push("");
    lines.push("Body:");
    lines.push(parsedEmail.text);
  } else if (parsedEmail.html) {
    lines.push("");
    lines.push("Body (HTML):");
    lines.push(parsedEmail.html);
  }
  return lines.join("\n").slice(0, AI_MAX_INPUT_CHARS);
}

async function runModel(
  env: WorkerEnv,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  schema?: unknown,
) {
  const response = await (
    env.AI as { run: (model: string, input: Record<string, unknown>) => Promise<unknown> }
  ).run(modelId, {
    messages,
    ...(schema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: schema,
          },
        }
      : {}),
  } as Record<string, unknown>);

  const payloadCandidate = (response as { response?: unknown }).response ?? response;
  return payloadCandidate;
}

export function createCloudflareAiAdapter(
  env: WorkerEnv,
  overrides?: { modelId?: string },
): AiPort {
  const modelId = overrides?.modelId ?? env.CLOUDFLARE_AI_MODEL;
  return {
    async extractTransaction(
      input: string,
      _scope?: AiCallScope,
    ): Promise<ExtractedTransaction | null> {
      const systemPrompt =
        (await env.PROMPTS_KV.get("SYSTEM_PROMPT")) ??
        "Eres un extractor preciso de transacciones financieras.";

      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildExtractTransactionPrompt(JSON.stringify(PARSED_TRANSACTION_SCHEMA), input),
        },
      ];

      const payload = await runModel(env, modelId, messages, PARSED_TRANSACTION_SCHEMA);
      return normalizeExtracted(payload, input);
    },

    async classifyCategory(
      input: CategoryClassificationInput,
      _scope?: AiCallScope,
    ): Promise<{ categoryId: string | null; confidence: number }> {
      const heuristic = tryHeuristicCategory(input);
      if (heuristic.categoryId) return heuristic;

      const messages = [
        {
          role: "system",
          content: "Clasifica texto financiero en categorias usando solo opciones disponibles.",
        },
        { role: "user", content: buildClassifyCategoryPrompt(input) },
      ];

      const payload = await runModel(env, modelId, messages, CLASSIFICATION_SCHEMA);
      return normalizeClassification(payload);
    },

    async generateMessage(input: MessageGenerationInput, _scope?: AiCallScope): Promise<string> {
      return generateDeterministicMessage(input);
    },
  };
}

export async function extractTransactionFromEmailWithAi(
  env: WorkerEnv,
  parsedEmail: Email,
): Promise<ExtractedTransaction | null> {
  const input = buildEmailContext(parsedEmail);
  const adapter = createCloudflareAiAdapter(env);
  return adapter.extractTransaction(input);
}

export function emailToAiInput(parsedEmail: Email): string {
  return buildEmailContext(parsedEmail);
}
