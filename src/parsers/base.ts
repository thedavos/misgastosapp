import { parse, isValid, formatISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Email } from "postal-mime";
import type { ParsedTransaction } from "../types";

export interface EmailParser {
  // Identificar si este parser puede manejar el email
  canHandle(email: Email): boolean;

  // Parsear el email ya procesado por PostalMime
  parse(email: Email): ParsedTransaction | null;

  // Nombre del banco/servicio
  getName(): string;
}

export abstract class BaseParser implements EmailParser {
  abstract canHandle(email: Email): boolean;
  abstract parse(email: Email): ParsedTransaction | null;
  abstract getName(): string;

  // Utilidad para obtener el 'from' como string
  protected getFromAddress(email: Email): string | null {
    if (!email.from) return null;
    if ("address" in email.from) {
      return email.from.address || null;
    }

    return null;
  }

  // Utilidad para buscar en headers
  protected getHeader(email: Email, key: string): string | null {
    const header = email.headers.find((header) => header.key.toLowerCase() === key.toLowerCase());
    return header ? header.value : null;
  }

  // Obtener el contenido de texto (prioriza text sobre html)
  protected getTextContent(email: Email): string {
    return email.text || this.stripHtml(email.html || "");
  }

  // Remover tags HTML básico
  protected stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  protected parseDate(dateString: string, fallback?: string): string {
    if (!dateString) {
      return this.getFallbackDate(fallback);
    }

    const formats = [
      // "19 de octubre de 2025 - 09:49 AM"
      "d 'de' MMMM 'de' yyyy '-' hh:mm a",
      // "19/10/2025 09:49"
      "dd/MM/yyyy HH:mm",
      // "2025-10-19 09:49"
      "yyyy-MM-dd HH:mm",
      // "19 oct 2025 09:49 AM"
      "d MMM yyyy hh:mm a",
      // 19 de octubre 2025 09:49
      "d 'de' MMMM yyyy HH:mm",
    ];

    for (const formatString of formats) {
      const parsedDate = parse(dateString, formatString, new Date(), { locale: es });

      if (isValid(parsedDate)) {
        return formatISO(parsedDate, { representation: "complete" }).replace(/\+00:00$/, "-05:00");
      }
    }

    return this.getFallbackDate(fallback);
  }

  private getFallbackDate(fallback?: string): string {
    if (fallback) {
      try {
        const emailDate = new Date(fallback);
        if (isValid(emailDate)) {
          return emailDate.toISOString();
        }
      } catch {
        // Continuar al default
      }
    }
    return new Date().toISOString();
  }
}
