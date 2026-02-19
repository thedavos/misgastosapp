import type { Email } from "postal-mime";
import { BaseParser } from "./base";
import type { ParsedTransaction } from "../types";

export class YapeParser extends BaseParser {
  canHandle(email: Email): boolean {
    const from = this.getFromAddress(email);
    const subject = email.subject || "";

    if (!from || !subject) {
      return false;
    }

    return (
      from.includes("yape.com.pe") ||
      from.includes("yape") ||
      subject.toLowerCase().includes("yape")
    );
  }

  parse(email: Email): ParsedTransaction | null {
    try {
      const text = this.getTextContent(email);

      // "Yapeo de S/ 15.50 a Juan Perez"
      const amountMatch = text.match(/(?:yapeo|yapaste|enviaste).*?S\/\s*([\d,\.]+)/i);
      if (!amountMatch) return null;

      const amount = parseFloat(amountMatch[1].replace(",", ""));

      const merchantMatch = text.match(/(?:a|para)\s+([^\n\.]+)/i);
      const merchant = merchantMatch ? merchantMatch[1].trim() : "Yapeo";

      return {
        amount,
        currency: "S/",
        merchant,
        date: email.date || new Date().toISOString(),
        bank: "Yape",
        rawText: text.substring(0, 500),
      };
    } catch (error) {
      console.error("Error parseando Yape:", error);
      return null;
    }
  }

  getName(): string {
    return "Yape";
  }
}
