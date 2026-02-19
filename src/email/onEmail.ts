import PostalMime from "postal-mime";
import { getParser } from "../parsers";
import { safeLog } from "../logging";
import type { WorkerEnv } from "types/env";

export async function onEmail(
  message: ForwardableEmailMessage,
  _env: WorkerEnv,
  _ctx: ExecutionContext,
) {
  try {
    const parsedEmail = await PostalMime.parse(message.raw);

    safeLog("email.meta", {
      from: parsedEmail.from?.address,
      to: parsedEmail.to?.map((t) => t.address).join(","),
      subject: parsedEmail.subject,
      date: String(parsedEmail.date || ""),
    });

    const parser = getParser(parsedEmail);

    if (!parser) {
      safeLog("email.error", { reason: "No parser available" });
      return;
    }

    safeLog("email.parser", { parser: parser.getName() });

    const transaction = parser.parse(parsedEmail);

    if (!transaction) {
      safeLog("email.error", { reason: "No se pudo parsear la transacción" });
      return;
    }

    safeLog("email.transaction", { transaction });
    safeLog("email.done");
  } catch (error) {
    safeLog("email.error", { error: String(error) });
  }
}
