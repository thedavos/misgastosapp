/**
 * Resolves expense occurred_at from AI/candidate dates plus relative Spanish hints.
 * Prefers "hoy"/"ayer" in source text over a bad model date (e.g. epoch).
 */
export function resolveExpenseOccurredAt(input: {
  candidate?: string | null;
  sourceText?: string | null;
  nowIso: string;
  timezone?: string;
}): string {
  const now = new Date(input.nowIso);
  const fallbackIso = Number.isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString();
  const normalized = (input.sourceText ?? "").trim().toLowerCase();

  if (/\bhoy\b/.test(normalized) && !/\bayer\b/.test(normalized)) {
    return fallbackIso;
  }

  if (/\bayer\b/.test(normalized)) {
    const yesterday = new Date(fallbackIso);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return yesterday.toISOString();
  }

  if (input.candidate) {
    const parsed = new Date(input.candidate);
    if (!Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 2000) {
      return parsed.toISOString();
    }
  }

  return fallbackIso;
}
