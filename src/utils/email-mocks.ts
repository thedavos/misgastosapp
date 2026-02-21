import { ForwardableEmailMessage } from "@cloudflare/workers-types";
import { vi } from "vitest";

export function createEmailMessage(rawEmail: string): ForwardableEmailMessage {
  const encoder = new TextEncoder();

  return {
    raw: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(rawEmail));
        controller.close();
      },
    }),
    headers: new Headers({
      from: "banco@example.com",
      to: "tu@example.com",
      subject: "Comprobante de compra",
    }),
    from: "banco@example.com",
    to: "tu@example.com",
    forward: vi.fn(),
    reject: vi.fn(),
  } as unknown as ForwardableEmailMessage;
}
