import { Either, Effect } from "effect";
import PostalMime, { Email } from "postal-mime";
import type { WorkerEnv } from "types/env";
import { AI_MODEL, parseEmailTransactionWithAi } from "@/ai/transactionParser";
import { getParser } from "@/parsers";
import { EmailAiError, EmailParseError } from "@/email/errors";
import type { ParserFailure, ParserSuccess } from "@/email/types";

export function getTransactionWithParser(
  parsedEmail: Email,
): Either.Either<ParserSuccess, ParserFailure> {
  const parser = getParser(parsedEmail);
  if (!parser) {
    return Either.left({ _tag: "NoParser", parsedEmail });
  }

  const parserName = parser.getName();
  const transaction = parser.parse(parsedEmail);
  if (!transaction) {
    return Either.left({ _tag: "ParseFailed", parsedEmail, parserName });
  }

  return Either.right({ parserName, transaction });
}

type ParseOptions = {
  requestId?: string;
};

export const parseEmail = (raw: ForwardableEmailMessage["raw"], options: ParseOptions = {}) =>
  Effect.tryPromise({
    try: () => PostalMime.parse(raw),
    catch: (error) =>
      new EmailParseError({
        source: "postal-mime",
        message: "No se pudo parsear el email entrante",
        requestId: options.requestId,
        cause: error,
      }),
  });

export const parseEmailWithAi = (env: WorkerEnv, parsedEmail: Email, options: ParseOptions = {}) =>
  Effect.tryPromise({
    try: () => parseEmailTransactionWithAi(env, parsedEmail),
    catch: (error) =>
      new EmailAiError({
        provider: "cloudflare-workers-ai",
        model: AI_MODEL,
        message: "Fallo la extraccion de transaccion con Workers AI",
        requestId: options.requestId,
        cause: error,
      }),
  });
