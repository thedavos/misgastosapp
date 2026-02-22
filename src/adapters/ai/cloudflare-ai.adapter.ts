import type { Email } from "postal-mime";
import type { WorkerEnv } from "types/env";
import type {
  AiPort,
  CategoryClassificationInput,
  ExtractedTransaction,
  MessageGenerationInput,
} from "@/ports/ai.port";
import { getCurrencySymbol } from "@/utils/currencySymbol";
import { buildClassifyCategoryPrompt } from "@/adapters/ai/prompts/classify-category.prompt";
import { buildExtractTransactionPrompt } from "@/adapters/ai/prompts/extract-transaction.prompt";
import { buildGenerateMessagePrompt } from "@/adapters/ai/prompts/generate-message.prompt";

const AI_MAX_INPUT_CHARS = 6000;

const PARSED_TRANSACTION_SCHEMA = {
  type: "object",
  properties: {
    amount: { type: "number" },
    currency: { type: "string" },
    merchant: { type: "string" },
    date: { type: "string" },
    cardType: { type: "string" },
    bank: { type: "string" },
    rawText: { type: "string" },
  },
  required: ["amount", "currency", "merchant", "date", "bank", "rawText"],
  additionalProperties: false,
} as const;

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    categoryId: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: ["categoryId", "confidence"],
  additionalProperties: false,
} as const;

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

async function runModel(env: WorkerEnv, messages: Array<{ role: string; content: string }>, schema?: unknown) {
  const response = await (env.AI as { run: (model: string, input: Record<string, unknown>) => Promise<unknown> }).run(
    env.CLOUDFLARE_AI_MODEL,
    {
    messages,
    ...(schema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: schema,
          },
        }
      : {}),
    } as Record<string, unknown>,
  );

  const payloadCandidate = (response as { response?: unknown }).response ?? response;
  return payloadCandidate;
}

function normalizeExtracted(payloadCandidate: unknown, rawInput: string): ExtractedTransaction | null {
  if (!payloadCandidate || typeof payloadCandidate !== "object") return null;
  const payload = payloadCandidate as Partial<ExtractedTransaction>;

  if (typeof payload.amount !== "number") return null;
  if (
    typeof payload.currency !== "string" ||
    typeof payload.merchant !== "string" ||
    typeof payload.date !== "string"
  ) {
    return null;
  }

  const rawText =
    typeof payload.rawText === "string" && payload.rawText.length > 0 ? payload.rawText : rawInput;
  const bank = typeof payload.bank === "string" && payload.bank.length > 0 ? payload.bank : "unknown";

  return {
    amount: payload.amount,
    currency: payload.currency,
    symbol: getCurrencySymbol(payload.currency),
    merchant: payload.merchant,
    date: payload.date,
    cardType: typeof payload.cardType === "string" ? payload.cardType : undefined,
    bank,
    rawText,
  };
}

function tryHeuristicCategory(input: CategoryClassificationInput): { categoryId: string | null; confidence: number } {
  const normalizedReply = input.userReply.trim().toLowerCase();
  const exact = input.categories.find(
    (category) => category.name.toLowerCase() === normalizedReply || category.slug.toLowerCase() === normalizedReply,
  );

  if (exact) {
    return { categoryId: exact.id, confidence: 0.99 };
  }

  const contains = input.categories.find((category) => normalizedReply.includes(category.name.toLowerCase()));
  if (contains) {
    return { categoryId: contains.id, confidence: 0.8 };
  }

  return { categoryId: null, confidence: 0 };
}

export function createCloudflareAiAdapter(env: WorkerEnv): AiPort {
  return {
    async extractTransaction(input: string): Promise<ExtractedTransaction | null> {
      const systemPrompt = (await env.PROMPTS_KV.get("SYSTEM_PROMPT")) ??
        "Eres un extractor preciso de transacciones financieras.";

      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildExtractTransactionPrompt(JSON.stringify(PARSED_TRANSACTION_SCHEMA), input),
        },
      ];

      const payload = await runModel(env, messages, PARSED_TRANSACTION_SCHEMA);
      return normalizeExtracted(payload, input);
    },

    async classifyCategory(input: CategoryClassificationInput): Promise<{ categoryId: string | null; confidence: number }> {
      const heuristic = tryHeuristicCategory(input);
      if (heuristic.categoryId) return heuristic;

      const messages = [
        {
          role: "system",
          content: "Clasifica texto financiero en categorias usando solo opciones disponibles.",
        },
        { role: "user", content: buildClassifyCategoryPrompt(input) },
      ];

      const payload = await runModel(env, messages, CLASSIFICATION_SCHEMA);
      if (!payload || typeof payload !== "object") return { categoryId: null, confidence: 0 };

      const parsed = payload as { categoryId?: unknown; confidence?: unknown };
      return {
        categoryId: typeof parsed.categoryId === "string" ? parsed.categoryId : null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      };
    },

    async generateMessage(input: MessageGenerationInput): Promise<string> {
      const messages = [
        {
          role: "system",
          content: "Eres un asistente financiero empatico y breve. Responde en español.",
        },
        { role: "user", content: buildGenerateMessagePrompt(input) },
      ];

      const payload = await runModel(env, messages);
      if (typeof payload === "string") return payload;
      if (payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string") {
        return payload.text;
      }

      if (input.kind === "ask_category") {
        return `Hola, vi este gasto en ${input.merchant ?? "un comercio"}. ¿Qué categoría le pongo?`;
      }
      return `Listo, ya lo guardé en ${input.categoryName ?? "la categoría indicada"}.`;
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
