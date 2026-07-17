import { describe, expect, it } from "vitest";
import { looksLikeNewExpenseMessage } from "@/utils/text/looksLikeNewExpenseMessage";

describe("looksLikeNewExpenseMessage", () => {
  it("detects common Spanish expense phrases", () => {
    expect(looksLikeNewExpenseMessage("20 soles metro hoy")).toBe(true);
    expect(looksLikeNewExpenseMessage("S/. 25 en Tambo")).toBe(true);
    expect(looksLikeNewExpenseMessage("S/ 18 uber")).toBe(true);
    expect(looksLikeNewExpenseMessage("USD 10 starbucks")).toBe(true);
    expect(looksLikeNewExpenseMessage("soles 15 pan")).toBe(true);
  });

  it("rejects short category-like replies", () => {
    expect(looksLikeNewExpenseMessage("Comida")).toBe(false);
    expect(looksLikeNewExpenseMessage("Transporte")).toBe(false);
    expect(looksLikeNewExpenseMessage("1")).toBe(false);
    expect(looksLikeNewExpenseMessage("tal vez")).toBe(false);
    expect(looksLikeNewExpenseMessage("otros")).toBe(false);
  });
});
