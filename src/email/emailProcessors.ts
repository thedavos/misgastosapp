import { Either, Effect } from "effect";
import PostalMime, { Email } from "postal-mime";
import type { WorkerEnv } from "types/env";
import { parseEmailTransactionWithAi } from "@/ai/transactionParser";
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

export const parseEmail = (raw: ForwardableEmailMessage["raw"]) =>
  Effect.tryPromise({
    try: () => PostalMime.parse(raw),
    catch: (error) => new EmailParseError({ cause: error }),
  });

export const parseEmailWithAi = (env: WorkerEnv, parsedEmail: Email) =>
  Effect.tryPromise({
    try: () => parseEmailTransactionWithAi(env, parsedEmail),
    catch: (error) => new EmailAiError({ cause: error }),
  });
