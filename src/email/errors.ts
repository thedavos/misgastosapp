import { Data } from "effect";

type EmailErrorBase = {
  message: string;
  requestId?: string;
  cause: unknown;
};

export class EmailParseError extends Data.TaggedError("EmailParseError")<{
  source: "postal-mime";
} & EmailErrorBase> {}

export class EmailAiError extends Data.TaggedError("EmailAiError")<{
  provider: "cloudflare-workers-ai";
  model: string;
} & EmailErrorBase> {}
