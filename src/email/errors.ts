import { Data } from "effect";

export class EmailParseError extends Data.TaggedError("EmailParseError")<{
  cause: unknown;
}> {}

export class EmailAiError extends Data.TaggedError("EmailAiError")<{
  cause: unknown;
}> {}
