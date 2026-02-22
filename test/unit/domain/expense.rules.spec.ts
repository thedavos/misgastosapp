import { describe, expect, it } from "vitest";
import { isValidExpenseCandidate } from "@/domain/expense/rules";

describe("expense rules", () => {
  it("accepts a valid expense candidate", () => {
    expect(
      isValidExpenseCandidate({
        amount: 42,
        currency: "PEN",
        merchant: "Tambo",
      }),
    ).toBe(true);
  });

  it("rejects non-positive amount", () => {
    expect(
      isValidExpenseCandidate({
        amount: 0,
        currency: "PEN",
        merchant: "Tambo",
      }),
    ).toBe(false);
  });
});
