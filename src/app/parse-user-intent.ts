import { isValidExpenseCandidate } from "@/domain/expense/rules";
import type { IntentContext, ParsedIntent } from "@/domain/intent/entity";
import type { AiPort } from "@/ports/ai.port";
import type { LoggerPort } from "@/ports/logger.port";

export type ParseUserIntentDeps = {
  ai: AiPort;
  logger?: LoggerPort;
};

function toAmountMinor(amount: number): number {
  return Math.round(amount * 100);
}

function normalizeText(input: string): string {
  return input.trim().toLowerCase();
}

function normalizeCurrency(rawCurrency: string | undefined, defaultCurrency: string): string {
  if (!rawCurrency) return defaultCurrency;
  const normalized = rawCurrency.trim().toUpperCase();
  if (normalized === "S/" || normalized === "S/.") return "PEN";
  return normalized;
}

function extractUpdateAmountPatch(
  text: string,
  defaultCurrency: string,
): { amountMinor: number; currency: string } | null {
  const explicitMoneyMatches = Array.from(
    text.matchAll(/(?:\b(pen|usd|eur)\b|s\/\.?)\s*(\d+(?:[.,]\d{1,2})?)/gi),
  );
  const fallbackMatches = Array.from(
    text.matchAll(/(?:fueron|fue|por|a)\s+(\d+(?:[.,]\d{1,2})?)(?!\s*(?:am|pm))/gi),
  );

  const lastExplicit = explicitMoneyMatches[explicitMoneyMatches.length - 1];
  const rawCurrency = lastExplicit?.[1] ?? lastExplicit?.[0].match(/s\/\.?/i)?.[0];
  const lastFallback = fallbackMatches[fallbackMatches.length - 1];
  const rawAmount = lastExplicit?.[2] ?? lastFallback?.[1];
  if (!rawAmount) return null;

  const parsedAmount = Number(rawAmount.replace(",", "."));
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;

  return {
    amountMinor: toAmountMinor(parsedAmount),
    currency: normalizeCurrency(rawCurrency, defaultCurrency),
  };
}

export function createParseUserIntent(deps: ParseUserIntentDeps) {
  return async function parseUserIntent(input: {
    text: string;
    context: IntentContext;
    requestId?: string;
  }): Promise<ParsedIntent> {
    const normalized = normalizeText(input.text);

    if (!normalized) {
      return {
        name: "unknown",
        payload: { confidence: 0, reason: "empty_input" },
      };
    }

    if (
      normalized.includes("resumen de hoy") ||
      normalized.includes("resumen del día") ||
      normalized.includes("resumen del dia")
    ) {
      return {
        name: "get_report",
        payload: { periodKind: "day", confidence: 0.98 },
      };
    }

    if (normalized.includes("resumen de la semana") || normalized.includes("resumen semanal")) {
      return {
        name: "get_report",
        payload: { periodKind: "week", confidence: 0.98 },
      };
    }

    if (normalized.includes("resumen del mes") || normalized.includes("resumen mensual")) {
      return {
        name: "get_report",
        payload: { periodKind: "month", confidence: 0.98 },
      };
    }

    if (
      normalized.includes("en qué gasté más") ||
      normalized.includes("en que gaste mas") ||
      normalized.includes("top spend")
    ) {
      return {
        name: "get_report",
        payload: { periodKind: "top_spend", confidence: 0.96 },
      };
    }

    if (
      normalized === "ayuda" ||
      normalized === "help" ||
      normalized.includes("cómo funciona") ||
      normalized.includes("como funciona") ||
      normalized.includes("qué puedes hacer") ||
      normalized.includes("que puedes hacer")
    ) {
      return {
        name: "help",
        payload: { topic: "examples", confidence: 0.97 },
      };
    }

    if (
      normalized.includes("borra") ||
      normalized.includes("elimina") ||
      normalized.includes("borrar último") ||
      normalized.includes("borrar ultimo") ||
      normalized.includes("eliminar último") ||
      normalized.includes("eliminar ultimo")
    ) {
      return {
        name: "delete_last_expense",
        payload: { confidence: 0.93 },
      };
    }

    if (
      normalized.includes("corrige") ||
      normalized.includes("corrígelo") ||
      normalized.includes("corrigelo") ||
      normalized.includes("cámbia") ||
      normalized.includes("cambia") ||
      normalized.includes("no fueron") ||
      normalized.includes("fue ayer")
    ) {
      const amountPatch = extractUpdateAmountPatch(input.text, input.context.defaultCurrency);
      if (amountPatch) {
        return {
          name: "update_last_expense",
          payload: {
            patch: amountPatch,
            confidence: 0.92,
          },
        };
      }

      return {
        name: "update_last_expense",
        payload: {
          patch: {
            description: input.text,
          },
          confidence: 0.55,
        },
      };
    }

    const extracted = await deps.ai.extractTransaction(input.text);
    if (extracted && isValidExpenseCandidate(extracted)) {
      return {
        name: "create_expense",
        payload: {
          draft: {
            amountMinor: toAmountMinor(extracted.amount),
            currency: extracted.currency || input.context.defaultCurrency,
            merchant: extracted.merchant,
            description: extracted.rawText,
            occurredAt: extracted.date,
          },
          missingFields: [],
          confidence: 0.9,
        },
      };
    }

    deps.logger?.info("intent.parse_unknown", {
      requestId: input.requestId,
      sourceType: input.context.sourceType,
    });

    return {
      name: "unknown",
      payload: { confidence: 0.2, reason: "no_supported_intent_detected" },
    };
  };
}
