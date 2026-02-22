import type { Email } from "postal-mime";
import { BaseParser } from "@/adapters/email/bank-parsers/base";
import type { ParsedTransaction } from "@/types";

export class Global66Parser extends BaseParser {
  TRUSTED_SENDERS = ["global66.com", "notificaciones@global66"];

  parse(email: Email): ParsedTransaction | null {
    try {
      const text = this.getTextContent(email);

      const amountMatch = text.match(/(USD|PEN|CLP|ARS)\s*([\d,.]+)/i);
      if (!amountMatch) return null;

      const currency = amountMatch[1].toUpperCase();
      const amount = parseFloat(amountMatch[2].replace(",", ""));

      const merchantMatch = text.match(/(?:destinatario|to|para)\s*:?\s*([^\n]+)/i);
      const merchant = merchantMatch ? merchantMatch[1].trim() : "Global66";

      return {
        amount,
        currency,
        merchant,
        date: email.date || new Date().toISOString(),
        bank: "Global66",
        rawText: text.substring(0, 500),
      };
    } catch (error) {
      console.error("Error parseando Global66:", error);
      return null;
    }
  }

  getName(): string {
    return "Global66";
  }
}
