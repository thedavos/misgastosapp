import type { Email } from "postal-mime";
import { BaseParser } from "./base";
import type { ParsedTransaction } from "../types";

export class InterbankParser extends BaseParser {
  getName(): string {
    return "Interbank";
  }

  canHandle(email: Email): boolean {
    const from = this.getFromAddress(email);
    const subject = email.subject || "";

    if (!from || !subject) {
      return false;
    }

    return (
      from.includes("interbank.pe") ||
      from.includes("notificaciones@interbank") ||
      subject.toLowerCase().includes("interbank")
    );
  }

  parse(email: Email): ParsedTransaction | null {
    try {
      const text = this.getTextContent(email);

      // Interbank: "Compra por S/ 150.00"
      const amountMatch = text.match(/(?:compra|consumo|pago).*?([A-Z$\/]+)?\s*([\d,\.]+)/i);
      if (!amountMatch) return null;

      const currency = amountMatch[1] || "S/";
      const amount = parseFloat(amountMatch[2].replace(",", ""));

      const merchantMatch = text.match(/(?:en|comercio|establecimiento)[\s:]+([^\n\.]+)/i);
      const merchant = merchantMatch ? merchantMatch[1].trim() : "Comercio Interbank";

      return {
        amount,
        currency: currency.trim(),
        merchant,
        date: email.date || new Date().toISOString(),
        bank: "Interbank",
        rawText: text.substring(0, 500),
      };
    } catch (error) {
      console.error("Error parseando Interbank:", error);
      return null;
    }
  }
}
