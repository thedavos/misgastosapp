import type { Email } from "postal-mime";
import { AstropayParser } from "@/parsers/astropay";
import type { EmailParser } from "@/parsers/base";
import { BcpParser } from "@/parsers/bcp";
import { Global66Parser } from "@/parsers/global66";
import { InterbankParser } from "@/parsers/interbank";
import { YapeParser } from "@/parsers/yape";

export const PARSERS: EmailParser[] = [
  new BcpParser(),
  new InterbankParser(),
  new AstropayParser(),
  new Global66Parser(),
  new YapeParser(),
];

export function getParser(email: Email): EmailParser | null {
  return PARSERS.find((parser) => parser.canHandle(email)) || null;
}

export * from "@/parsers/base";
export * from "@/parsers/bcp";
export * from "@/parsers/astropay";
export * from "@/parsers/global66";
export * from "@/parsers/yape";
export * from "@/parsers/interbank";
