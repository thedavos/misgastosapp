import { ForwardableEmailMessage } from "@cloudflare/workers-types";
import { vi } from "vitest";

export function makeMessage(rawEmail: string): ForwardableEmailMessage {
  const enc = new TextEncoder();
  return {
    raw: new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(rawEmail));
        c.close();
      },
    }),
    headers: new Headers({ from: "servicioalcliente@netinterbank.com.pe" }),
    from: "servicioalcliente@netinterbank.com.pe",
    to: "davidvargas.d45@gmail.com",
    forward: vi.fn(),
    reject: vi.fn(),
  } as unknown as ForwardableEmailMessage;
}
