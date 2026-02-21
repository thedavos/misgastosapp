import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import bcpMail from "test/fixtures/bcp/bcp_consumo_tarjeta_debito.txt?raw";
import ibkEmail from "test/fixtures/ibk/ibk_constancia_de_pago.txt?raw";
import { describe, it, expect } from "vitest";
import { handleEmail } from "@/email/handleEmail";
import { makeMessage } from "@/utils/makeMessage";
// Import your worker so you can unit test it
import worker from "../src";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Misgastosapp Worker", () => {
  describe("OnFetch", () => {
    it("responde con el mensaje de estado del worker", async () => {
      const request = new IncomingRequest("https://example.com/");
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain");
      expect(await response.text()).toBe("MisGastos Worker Active - v1.0");
    });
  });

  describe("OnEmail", () => {
    it("procesa un email de ibk", async () => {
      const message = makeMessage(ibkEmail);
      const ctx = createExecutionContext();
      await handleEmail(message, env, ctx);
      await waitOnExecutionContext(ctx);
    });

    it("procesa un email de bcp", async () => {
      const message = makeMessage(bcpMail);
      const ctx = createExecutionContext();
      await handleEmail(message, env, ctx);
      await waitOnExecutionContext(ctx);
    });
  });
});
