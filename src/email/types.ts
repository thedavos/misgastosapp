import type { Email } from "postal-mime";
import type { ParsedTransaction } from "@/types";

export type ParserSuccess = {
  parserName: string;
  transaction: ParsedTransaction;
};

export type ParserFailure =
  | { _tag: "NoParser"; parsedEmail: Email }
  | {
      _tag: "ParseFailed";
      parsedEmail: Email;
      parserName: string;
    };
