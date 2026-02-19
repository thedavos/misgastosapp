import PostalMime from "postal-mime";
import { getParser } from "./parsers";
import { WorkerEnv } from "types/env";

const MAX_PREVIEW = 8000;

function safeLog(event: string, data: Record<string, unknown> = {}) {
  try {
    console.log(JSON.stringify({ event, ...data }));
  } catch {
    console.log(`[${event}]`, data);
  }
}

function take(s: string, n = MAX_PREVIEW) {
  return s.length <= n ? s : s.slice(0, n) + `… [${s.length - n} chars truncados]`;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return new Response("MisGastos Worker Active - v1.0", {
      headers: { "Content-Type": "text/plain" },
    });
  },
  async email(message, env: WorkerEnv, ctx: ExecutionContext) {
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
  },
} satisfies ExportedHandler<WorkerEnv>;
