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
  if (!Option.isSome(failure)) {
    const pretty = Cause.pretty(cause);
    return {
      errorCode: "Defect",
      errorMessage: pretty.slice(0, 2000),
    };
  }

  const value = failure.value as TaggedErrorLike & { cause?: unknown };

  const tagged = typeof value._tag === "string" ? value._tag : undefined;
  const explicitMessage = typeof value.message === "string" ? value.message.trim() : "";
  const causeMessage =
    value.cause instanceof Error
      ? value.cause.message
      : typeof value.cause === "string"
        ? value.cause
        : value.cause
          ? JSON.stringify(value.cause)
          : undefined;

  return {
    errorCode: tagged,
    errorMessage: (explicitMessage || causeMessage || tagged || "unknown error").slice(0, 2000),
  };
}
