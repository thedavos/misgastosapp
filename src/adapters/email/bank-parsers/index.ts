import type { Email } from "postal-mime";
import { AstropayParser } from "@/adapters/email/bank-parsers/astropay";
import type { EmailParser } from "@/adapters/email/bank-parsers/base";
import { BcpParser } from "@/adapters/email/bank-parsers/bcp";
import { Global66Parser } from "@/adapters/email/bank-parsers/global66";
import { InterbankParser } from "@/adapters/email/bank-parsers/interbank";
import { YapeParser } from "@/adapters/email/bank-parsers/yape";

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

export * from "@/adapters/email/bank-parsers/base";
export * from "@/adapters/email/bank-parsers/bcp";
export * from "@/adapters/email/bank-parsers/astropay";
export * from "@/adapters/email/bank-parsers/global66";
export * from "@/adapters/email/bank-parsers/yape";
export * from "@/adapters/email/bank-parsers/interbank";
