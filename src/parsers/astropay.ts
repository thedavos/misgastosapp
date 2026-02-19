import type { Email } from "postal-mime";
import { BaseParser } from "./base";
import type { ParsedTransaction } from "../types";

export class AstropayParser extends BaseParser {
  canHandle(email: Email): boolean {
    const from = this.getFromAddress(email);
    const subject = email.subject || "";

    if (!from || !subject) {
      return false;
    }

    return from.includes("astropay") || subject.toLowerCase().includes("astropay");
  }

  parse(email: Email): ParsedTransaction | null {
    try {
      const text = this.getTextContent(email);

      const amountMatch = text.match(/(USD|EUR|BRL|ARS|PEN)\s*([\d,.]+)/i);
      if (!amountMatch) return null;

      const currency = amountMatch[1].toUpperCase();
      const amount = parseFloat(amountMatch[2].replace(",", ""));

      const merchantMatch = text.match(/(?:merchant|comercio|to)\s*:?\s*([^\n]+)/i);
      const merchant = merchantMatch ? merchantMatch[1].trim() : "Astropay";

      return {
        amount,
        currency,
        merchant,
        date: email.date || new Date().toISOString(),
        bank: "Astropay",
        rawText: text.substring(0, 500),
      };
    } catch (error) {
      console.error("Error parseando Astropay:", error);
      return null;
    }
  }

  getName(): string {
    return "Astropay";
  }
}
