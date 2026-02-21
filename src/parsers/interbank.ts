import type { Email } from "postal-mime";
import { BaseParser } from "@/parsers/base";
import type { ParsedTransaction } from "@/types";

export class InterbankParser extends BaseParser {
  TRUSTED_SENDERS = [
    "interbank.pe",
    "notificaciones@interbank",
    "servicioalcliente@netinterbank.com.pe",
  ];

  getName(): string {
    return "Interbank";
  }

  parse(email: Email): ParsedTransaction | null {
    try {
      const content = this.getTextContent(email);

      const merchantMatch = content.match(/Empresa:\s*([A-ZÁÉÍÓÚ][^\n]+?)(?:\s+Recibo|\s+Datos:)/i);
      const merchant = merchantMatch ? merchantMatch[1].trim() : "Desconocido";

      const amountMatch = content.match(/Moneda y monto:\s*([A-Z$/]+)\s*([\d,.]+)/i);
      if (!amountMatch) return null;

      const currency = amountMatch[1].trim();
      const amount = parseFloat(amountMatch[2].replace(",", ""));

      return {
        amount,
        currency: currency.trim(),
        merchant,
        date: email.date || new Date().toISOString(),
        bank: "Interbank",
        rawText: content.substring(0, 500),
      };
    } catch (error) {
      console.error("Error parseando Interbank:", error);
      return null;
    }
  }
}
