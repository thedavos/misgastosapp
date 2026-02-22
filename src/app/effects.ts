import { Effect } from "effect";

export function fromPromise<A, E>(tryFn: () => Promise<A>, mapError: (cause: unknown) => E): Effect.Effect<A, E> {
  return Effect.tryPromise({
    try: tryFn,
    catch: mapError,
  });
}
