import { describe, expect, it } from "vitest";
import { getCurrencySymbol } from "@/utils/currencySymbol";

describe("getCurrencySymbol", () => {
  it("retorna S/. para PEN", () => {
    expect(getCurrencySymbol("PEN")).toBe("S/.");
  });

  it("retorna $ para USD", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
  });

  it("retorna simbolo euro para EUR", () => {
    expect(getCurrencySymbol("EUR")).toBe("€");
  });

  it("normaliza alias comunes", () => {
    expect(getCurrencySymbol("S/")).toBe("S/.");
    expect(getCurrencySymbol("US$")).toBe("$");
    expect(getCurrencySymbol("€")).toBe("€");
  });

  it("incluye monedas de america latina", () => {
    expect(getCurrencySymbol("BRL")).toBe("R$");
    expect(getCurrencySymbol("MXN")).toBe("$");
    expect(getCurrencySymbol("COP")).toBe("$");
    expect(getCurrencySymbol("CLP")).toBe("$");
    expect(getCurrencySymbol("ARS")).toBe("$");
    expect(getCurrencySymbol("UYU")).toBe("$U");
    expect(getCurrencySymbol("CRC")).toBe("₡");
    expect(getCurrencySymbol("PYG")).toBe("₲");
  });

  it("devuelve el valor limpio si no conoce la moneda", () => {
    expect(getCurrencySymbol("ABC")).toBe("ABC");
    expect(getCurrencySymbol("  unknown ")).toBe("unknown");
  });
});
