import { AiTextGenerationOutput } from "@cloudflare/workers-types";
import PostalMime, { Email } from "postal-mime";
import type { WorkerEnv } from "types/env";
import type { ParsedTransaction } from "@/types";
import { getCurrencySymbol } from "@/utils/currencySymbol";

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

function buildEmailContext(parsedEmail: Email) {
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

async function inferTransactionFromTextWithAi(
  env: WorkerEnv,
  input: string,
): Promise<ParsedTransaction | null> {
  const systemPrompt = await env.PROMPTS_KV.get("SYSTEM_PROMPT");

  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: `Analiza el siguiente texto de un correo electrónico bancario de Perú.
                Extrae la información de la transacción y genera un JSON que cumpla estrictamente con este esquema: ${JSON.stringify(PARSED_TRANSACTION_SCHEMA)}.

                REQUERIMIENTOS ADICIONALES:
                - Si es un Yape o Plin, el 'merchant' es la persona o negocio que recibió el dinero.
                - Si el banco es Interbank, busca el 'Número de Operación' para el 'rawText' si es posible.
                - Si la moneda es 'S/' o 'Soles', usa 'PEN'. Si es '$' o 'Dólares', usa 'USD'.
                - Si el texto contiene múltiples transacciones, extrae solo la más reciente o principal.
                - Si el campo 'cardType' no es explícito pero es Yape/Plin, pon 'Billetera Digital'.

                TEXTO DEL CORREO:
                """
                ${input}
                """
      `,
    },
    {
      role: "user",
      content: input,
    },
  ];

  const response: AiTextGenerationOutput = await env.AI.run(env.CLOUDFLARE_AI_MODEL, {
    messages,
    response_format: {
      type: "json_schema",
      json_schema: PARSED_TRANSACTION_SCHEMA,
    },
  } as Record<string, unknown>);

  const payloadCandidate = (response as { response?: unknown }).response ?? response;
  if (!payloadCandidate || typeof payloadCandidate !== "object") return null;

  const payload = payloadCandidate as Partial<ParsedTransaction>;
  const rawText =
    typeof payload.rawText === "string" && payload.rawText.length > 0 ? payload.rawText : input;
  const bank =
    typeof payload.bank === "string" && payload.bank.length > 0 ? payload.bank : "unknown";

  if (typeof payload.amount !== "number") return null;
  if (
    typeof payload.currency !== "string" ||
    typeof payload.merchant !== "string" ||
    typeof payload.date !== "string"
  ) {
    return null;
  }

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

export async function extractTransactionFromEmailWithAi(
  env: WorkerEnv,
  parsedEmail: Awaited<ReturnType<typeof PostalMime.parse>>,
): Promise<ParsedTransaction | null> {
  const input = buildEmailContext(parsedEmail);
  return inferTransactionFromTextWithAi(env, input);
}
