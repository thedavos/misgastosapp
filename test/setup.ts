import { vi } from "vitest";

vi.mock("@/logger", () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => console.log("[info]", ...args),
    warn: (...args: unknown[]) => console.warn("[warn]", ...args),
    error: (...args: unknown[]) => console.error("[error]", ...args),
  }),
}));
