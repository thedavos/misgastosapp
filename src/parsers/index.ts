import type { Email } from "postal-mime";
import type { EmailParser } from "./base";
import { AstropayParser } from "./astropay";
import { BcpParser } from "./bcp";
import { Global66Parser } from "./global66";
import { InterbankParser } from "./interbank";
import { YapeParser } from "./yape";

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

export * from "./base";
export * from "./bcp";
export * from "./astropay";
export * from "./global66";
export * from "./yape";
export * from "./interbank";
