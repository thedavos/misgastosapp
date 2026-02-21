import { env } from "cloudflare:test";
import { vi, beforeEach } from "vitest";

beforeEach(() => {
  env.AI.run = vi.fn().mockResolvedValue({ response: null });
});
