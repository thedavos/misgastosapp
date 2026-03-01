export function isThreadDm(thread: unknown): boolean {
  const thr = (thread ?? {}) as Record<string, unknown>;
  return thr.isDM === true;
}
