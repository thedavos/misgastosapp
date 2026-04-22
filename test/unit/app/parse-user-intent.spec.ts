import { describe, expect, it, vi } from "vitest";
import { createParseUserIntent } from "@/app/parse-user-intent";

describe("parse user intent", () => {
  const baseContext = {
    sourceType: "whatsapp" as const,
    timezone: "America/Lima",
    defaultCurrency: "PEN",
    nowIso: "2026-04-22T20:00:00.000Z",
  };

  it("detects report intent heuristically", async () => {
    const parseUserIntent = createParseUserIntent({
      ai: {
        extractTransaction: vi.fn(),
        classifyCategory: vi.fn(),
        generateMessage: vi.fn(),
      },
    });

    const result = await parseUserIntent({
      text: "Resumen del mes",
      context: baseContext,
    });

    expect(result).toEqual({
      name: "get_report",
      payload: { periodKind: "month", confidence: 0.98 },
    });
  });

  it("detects create_expense from extracted transaction", async () => {
    const parseUserIntent = createParseUserIntent({
      ai: {
        extractTransaction: vi.fn().mockResolvedValue({
          amount: 12.5,
          currency: "PEN",
          symbol: "S/",
          merchant: "Tambo",
          date: "2026-04-22T15:00:00.000Z",
          bank: "BCP",
          rawText: "S/ 12.50 en Tambo",
        }),
        classifyCategory: vi.fn(),
        generateMessage: vi.fn(),
      },
    });

    const result = await parseUserIntent({
      text: "S/ 12.50 en Tambo",
      context: baseContext,
    });

    expect(result.name).toBe("create_expense");
    if (result.name !== "create_expense") throw new Error("unexpected intent");
    expect(result.payload.draft.amountMinor).toBe(1250);
    expect(result.payload.draft.merchant).toBe("Tambo");
  });

  it("detects strong update_last_expense intent for explicit amount corrections", async () => {
    const parseUserIntent = createParseUserIntent({
      ai: {
        extractTransaction: vi.fn(),
        classifyCategory: vi.fn(),
        generateMessage: vi.fn(),
      },
    });

    const result = await parseUserIntent({
      text: "Corrige el último gasto, fueron S/ 20",
      context: baseContext,
    });

    expect(result).toEqual({
      name: "update_last_expense",
      payload: {
        patch: {
          amountMinor: 2000,
          currency: "PEN",
        },
        confidence: 0.92,
      },
    });
  });

  it("keeps weak update_last_expense intent as fallback-safe when the patch is not explicit", async () => {
    const parseUserIntent = createParseUserIntent({
      ai: {
        extractTransaction: vi.fn(),
        classifyCategory: vi.fn(),
        generateMessage: vi.fn(),
      },
    });

    const result = await parseUserIntent({
      text: "Corrígelo por favor",
      context: baseContext,
    });

    expect(result).toEqual({
      name: "update_last_expense",
      payload: {
        patch: {
          description: "Corrígelo por favor",
        },
        confidence: 0.55,
      },
    });
  });
});
