import { describe, expect, it } from "vitest";
import { sanitize } from "../src/adapters/observability/sanitize";

describe("sanitize", () => {
  it("redacta claves sensibles", () => {
    const input = {
      token: "abcdef123456",
      nested: {
        api_key: "top-secret-key",
      },
      normal: "ok",
    };

    const result = sanitize(input);

    expect(result).toEqual({
      token: "[redacted]3456",
      nested: {
        api_key: "[redacted]-key",
      },
      normal: "ok",
    });
  });

  it("evita reventar con referencias circulares", () => {
    const circular: Record<string, unknown> = { foo: "bar" };
    circular.self = circular;

    const result = sanitize(circular);

    expect(result).toEqual({
      foo: "bar",
      self: "[circular]",
    });
  });

  it("trunca profundidad cuando excede maxDepth", () => {
    const input = {
      a: {
        b: {
          c: {
            d: {
              e: "deep",
            },
          },
        },
      },
    };

    const result = sanitize(input, { maxDepth: 2 });

    expect(result).toEqual({
      a: {
        b: {
          c: "[truncated]",
        },
      },
    });
  });
});
