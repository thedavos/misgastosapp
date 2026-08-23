import type { JSONSchema7 } from "ai";
import { formatAskCategoryMessage, formatConfirmationMessage } from "@/app/ask-category-message";
import type {
  CategoryClassificationInput,
  ExtractedTransaction,
  MessageGenerationInput,
} from "@/ports/ai.port";
import { getCurrencySymbol } from "@/utils/currencySymbol";

export const PARSED_TRANSACTION_SCHEMA: JSONSchema7 = {
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
};

export const CLASSIFICATION_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    categoryId: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: ["categoryId", "confidence"],
  additionalProperties: false,
};

export function normalizeExtracted(
  payloadCandidate: unknown,
  rawInput: string,
): ExtractedTransaction | null {
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
  const bank =
    typeof payload.bank === "string" && payload.bank.length > 0 ? payload.bank : "unknown";

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

export function normalizeClassification(payloadCandidate: unknown): {
  categoryId: string | null;
  confidence: number;
} {
  if (!payloadCandidate || typeof payloadCandidate !== "object") {
    return { categoryId: null, confidence: 0 };
  }

  const parsed = payloadCandidate as { categoryId?: unknown; confidence?: unknown };
  return {
    categoryId: typeof parsed.categoryId === "string" ? parsed.categoryId : null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };
}

export function tryHeuristicCategory(input: CategoryClassificationInput): {
  categoryId: string | null;
  confidence: number;
} {
  const normalizedReply = input.userReply.trim().toLowerCase();
  const exact = input.categories.find(
    (category) =>
      category.name.toLowerCase() === normalizedReply ||
      category.slug.toLowerCase() === normalizedReply,
  );

  if (exact) {
    return { categoryId: exact.id, confidence: 0.99 };
  }

  const contains = input.categories.find((category) =>
    normalizedReply.includes(category.name.toLowerCase()),
  );
  if (contains) {
    return { categoryId: contains.id, confidence: 0.8 };
  }

  return { categoryId: null, confidence: 0 };
}

export function generateDeterministicMessage(input: MessageGenerationInput): string {
  // Never free-form LLM for user-facing WhatsApp copy — models drift into
  // bank-letter / marketing prose (see ask_category + confirmation paths).
  if (input.kind === "ask_category") {
    return formatAskCategoryMessage({
      amount: input.amount,
      currency: input.currency,
      merchant: input.merchant,
      categories: input.categories ?? [],
    });
  }

  return formatConfirmationMessage(input.categoryName ?? "");
}
