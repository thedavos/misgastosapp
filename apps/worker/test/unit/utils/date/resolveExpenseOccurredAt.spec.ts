import { describe, expect, it } from "vitest";
import { resolveExpenseOccurredAt } from "@/utils/date/resolveExpenseOccurredAt";

describe("resolveExpenseOccurredAt", () => {
  it("uses nowIso when source text says hoy even if candidate is epoch", () => {
    expect(
      resolveExpenseOccurredAt({
        candidate: "1970-01-01T12:00:00.000Z",
        sourceText: "25 soles tambo hoy",
        nowIso: "2026-07-17T05:59:00.000Z",
        timezone: "America/Lima",
      }),
    ).toBe("2026-07-17T05:59:00.000Z");
  });

  it("shifts one day back for ayer", () => {
    expect(
      resolveExpenseOccurredAt({
        candidate: "1970-01-01T12:00:00.000Z",
        sourceText: "fue ayer en Tambo",
        nowIso: "2026-07-17T05:59:00.000Z",
      }),
    ).toBe("2026-07-16T05:59:00.000Z");
  });

  it("keeps a valid candidate date when there is no relative hint", () => {
    expect(
      resolveExpenseOccurredAt({
        candidate: "2026-04-22T10:00:00.000Z",
        sourceText: "S/ 18 en Tambo",
        nowIso: "2026-07-17T05:59:00.000Z",
      }),
    ).toBe("2026-04-22T10:00:00.000Z");
  });

  it("falls back to nowIso for invalid candidates", () => {
    expect(
      resolveExpenseOccurredAt({
        candidate: "not-a-date",
        sourceText: "S/ 18 en Tambo",
        nowIso: "2026-07-17T05:59:00.000Z",
      }),
    ).toBe("2026-07-17T05:59:00.000Z");
  });
});
