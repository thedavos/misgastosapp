import { beforeEach, describe, expect, it, vi } from "vitest";

describe("createLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("captura excepcion aunque context.error no sea Error", async () => {
    const sentryMock = {
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      captureException: vi.fn(() => "id"),
    };

    vi.doMock("@sentry/cloudflare", () => sentryMock);
    const { createLogger } = await import("../src/adapters/observability/index");
    const logger = createLogger({ env: "test", requestId: "rid" });

    logger.error("email.error", { error: "boom" });

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const [errorArg] = sentryMock.captureException.mock.calls[0] ?? [];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toContain("boom");
  });

  it("usa console.warn cuando el logger de sentry falla en warn", async () => {
    const sentryMock = {
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(() => {
          throw new Error("sentry down");
        }),
        error: vi.fn(),
      },
      captureException: vi.fn(() => "id"),
    };

    vi.doMock("@sentry/cloudflare", () => sentryMock);
    const { createLogger } = await import("../src/adapters/observability/index");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const logger = createLogger();
    logger.warn("x.warn", { any: "value" });

    expect(sentryMock.logger.warn).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});
