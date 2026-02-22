import { Cause, Option } from "effect";

type TaggedErrorLike = {
  _tag?: unknown;
  message?: unknown;
};

export function getEffectFailureMeta(cause: Cause.Cause<unknown>): {
  errorCode?: string;
  errorMessage?: string;
} {
  const failure = Cause.failureOption(cause);
  if (!Option.isSome(failure)) return {};

  const value = failure.value as TaggedErrorLike;

  return {
    errorCode: typeof value._tag === "string" ? value._tag : undefined,
    errorMessage: typeof value.message === "string" ? value.message : undefined,
  };
}
