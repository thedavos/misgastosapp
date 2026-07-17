import { describe, expect, it } from "vitest";
import {
  formatAskCategoryMessage,
  formatCategoryRetryMessage,
  formatConfirmationMessage,
} from "@/app/ask-category-message";

describe("ask-category-message", () => {
  it("formats ask message with amount, merchant, and default categories", () => {
    expect(
      formatAskCategoryMessage({
        amount: 25,
        currency: "PEN",
        merchant: "Tambo",
      }),
    ).toBe(
      "Vi S/. 25.00 en Tambo. ¿Qué categoría le pongo? (Comida, Transporte, Compras, Servicios, Otros)",
    );
  });

  it("formats retry message with category options", () => {
    expect(formatCategoryRetryMessage()).toBe(
      "No me quedó clara la categoría. Opciones: Comida, Transporte, Compras, Servicios, Otros.",
    );
  });

  it("formats short confirmation without marketing prose", () => {
    expect(formatConfirmationMessage("Transporte")).toBe("Listo, ya lo guardé en Transporte.");
    expect(formatConfirmationMessage()).toBe("Listo, ya lo guardé.");
  });
});
