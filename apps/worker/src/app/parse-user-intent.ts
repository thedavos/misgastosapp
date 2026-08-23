import { isValidExpenseCandidate } from "@/domain/expense/rules";
import type { IntentContext, ParsedIntent } from "@/domain/intent/entity";
import type { AiPort } from "@/ports/ai.port";
import type { LoggerPort } from "@/ports/logger.port";
import { resolveExpenseOccurredAt } from "@/utils/date/resolveExpenseOccurredAt";

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

function matchesReportIntent(normalized: string): boolean {
  return (
    normalized.includes("resumen de hoy") ||
    normalized.includes("resumen del día") ||
    normalized.includes("resumen del dia") ||
    normalized.includes("resumen de la semana") ||
    normalized.includes("resumen semanal") ||
    normalized.includes("resumen del mes") ||
    normalized.includes("resumen mensual") ||
    normalized.includes("en qué gasté más") ||
    normalized.includes("en que gaste mas") ||
    normalized.includes("top spend")
  );
}

function matchesHelpIntent(normalized: string): boolean {
  return (
    normalized === "ayuda" ||
    normalized === "help" ||
    normalized.includes("cómo funciona") ||
    normalized.includes("como funciona") ||
    normalized.includes("qué puedes hacer") ||
    normalized.includes("que puedes hacer")
  );
}

function matchesDeleteIntent(normalized: string): boolean {
  return (
    normalized.includes("borra") ||
    normalized.includes("elimina") ||
    normalized.includes("borrar último") ||
    normalized.includes("borrar ultimo") ||
    normalized.includes("eliminar último") ||
    normalized.includes("eliminar ultimo")
  );
}

function matchesUpdateIntent(normalized: string): boolean {
  return (
    normalized.includes("corrige") ||
    normalized.includes("corrígelo") ||
    normalized.includes("corrigelo") ||
    normalized.includes("cámbia") ||
    normalized.includes("cambia") ||
    normalized.includes("no fueron") ||
    normalized.includes("fue ayer")
  );
}

export function matchesExplicitCommandIntent(normalized: string): boolean {
  if (!normalized) return false;
  return (
    matchesReportIntent(normalized) ||
    matchesHelpIntent(normalized) ||
    matchesDeleteIntent(normalized) ||
    matchesUpdateIntent(normalized)
  );
}

type ReportPeriodKind = "day" | "week" | "month" | "top_spend";

function resolveReportPeriod(normalized: string): ReportPeriodKind {
  if (
    normalized.includes("resumen de hoy") ||
    normalized.includes("resumen del día") ||
    normalized.includes("resumen del dia")
  ) {
    return "day";
  }
  if (normalized.includes("resumen de la semana") || normalized.includes("resumen semanal")) {
    return "week";
  }
  if (normalized.includes("resumen del mes") || normalized.includes("resumen mensual")) {
    return "month";
  }
  return "top_spend";
}

export function createParseUserIntent(deps: ParseUserIntentDeps) {
  return async function parseUserIntent(input: {
    text: string;
    context: IntentContext;
    userId?: string;
    requestId?: string;
  }): Promise<ParsedIntent> {
    const normalized = normalizeText(input.text);

    if (!normalized) {
      return {
        name: "unknown",
        payload: { confidence: 0, reason: "empty_input" },
      };
    }

    if (matchesReportIntent(normalized)) {
      const periodKind = resolveReportPeriod(normalized);
      return {
        name: "get_report",
        payload: { periodKind, confidence: periodKind === "top_spend" ? 0.96 : 0.98 },
      };
    }

    if (matchesHelpIntent(normalized)) {
      return {
        name: "help",
        payload: { topic: "examples", confidence: 0.97 },
      };
    }

    if (matchesDeleteIntent(normalized)) {
      return {
        name: "delete_last_expense",
        payload: { confidence: 0.93 },
      };
    }

    if (matchesUpdateIntent(normalized)) {
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

    const extracted = await deps.ai.extractTransaction(input.text, { userId: input.userId });
    if (extracted && isValidExpenseCandidate(extracted)) {
      return {
        name: "create_expense",
        payload: {
          draft: {
            amountMinor: toAmountMinor(extracted.amount),
            currency: extracted.currency || input.context.defaultCurrency,
            merchant: extracted.merchant,
            description: extracted.rawText || input.text,
            occurredAt: resolveExpenseOccurredAt({
              candidate: extracted.date,
              sourceText: input.text,
              nowIso: input.context.nowIso,
              timezone: input.context.timezone,
            }),
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
