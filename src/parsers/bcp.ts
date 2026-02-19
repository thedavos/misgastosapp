import { BaseParser } from "./base";
import type { Email } from "postal-mime";
import type { ParsedTransaction } from "../types";

export class BcpParser extends BaseParser {
  getName(): string {
    return "BCP";
  }

  canHandle(email: Email): boolean {
    const from = this.getFromAddress(email);
    const subject = email.subject;

    if (!from || !subject) {
      return false;
    }

    return (
      from.includes("notificacionesbcp.com.pe") ||
      from.includes("bcp.com.pe") ||
      subject.includes("BCP") ||
      subject.includes("Tarjeta de Débito BCP") ||
      subject.includes("Tarjeta de Crédito BCP")
    );
  }

  parse(email: Email): ParsedTransaction | null {
    const textContent = this.getTextContent(email);

    const amountMatch = textContent.match(/consumo de\s+([A-Z$/]+)\s*([\d,.]+)/i);
    if (!amountMatch) {
      console.log("❌ BCP: No se encontró monto");
      return null;
    }

    const currency = amountMatch[1].trim();
    const amount = parseFloat(amountMatch[2].replace(",", ""));

    // Extraer comercio
    const merchantMatch = textContent.match(/en\s+([^\n.]+?)(?:\.|Fecha|Por tu seguridad)/i);
    const merchant = merchantMatch ? merchantMatch[1].trim() : "Comercio desconocido";

    // Extraer fecha
    const dateMatch = textContent.match(/Fecha y hora\s+(\d+ de \w+ de \d+ - \d+:\d+ [AP]M)/i);
    const dateStr = dateMatch ? dateMatch[1] : email.date || "";
    const date = this.parseDate(dateStr);

    // Extraer tipo de tarjeta
    const cardTypeMatch = textContent.match(/Tarjeta de (Débito|Crédito)/i);
    const cardType = cardTypeMatch ? `Tarjeta de ${cardTypeMatch[1]}` : "Desconocido";

    return {
      amount,
      currency,
      merchant,
      date,
      cardType,
      bank: "BCP",
      rawText: textContent.substring(0, 500),
    };
  }
}
