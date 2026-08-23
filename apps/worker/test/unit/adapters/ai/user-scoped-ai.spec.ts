import { beforeEach, describe, expect, it, vi } from "vitest";

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: (input: unknown) => generateObjectMock(input),
  jsonSchema: (schema: unknown) => ({ jsonSchema: schema }),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => ({
    chatModel: vi.fn((modelId: string) => ({ modelId })),
  })),
}));

import type { WorkerEnv } from "types/env";
import { createUserScopedAiAdapter } from "@/adapters/ai/user-scoped-ai.adapter";
import type { AiPort } from "@/ports/ai.port";
import type { UserAiGatewayConfig } from "@/ports/user-ai-gateway-repo.port";

function makeEnv(overrides?: Partial<Record<string, unknown>>): WorkerEnv {
  return {
    AI_PROVIDER: "cloudflare",
    CLOUDFLARE_AI_MODEL: "@cf/qwen/qwen3-30b-a3b-fp8",
    PROMPTS_KV: { get: async () => null },
    ...overrides,
  } as unknown as WorkerEnv;
}

function makeDeps(
  config: UserAiGatewayConfig | null,
  options?: {
    env?: Partial<Record<string, unknown>>;
    lookupShouldThrow?: boolean;
    aiRun?: ReturnType<typeof vi.fn>;
  },
) {
  const defaultExtract = vi.fn().mockResolvedValue({ amount: 1 });
  const defaultClassify = vi.fn().mockResolvedValue({ categoryId: "cat_default", confidence: 0.5 });
  const aiRun = options?.aiRun ?? vi.fn().mockResolvedValue({ response: {} });
  const getByUserId = vi
    .fn<(userId: string) => Promise<UserAiGatewayConfig | null>>()
    .mockImplementation(() =>
      options?.lookupShouldThrow ? Promise.reject(new Error("d1 down")) : Promise.resolve(config),
    );

  const adapter = createUserScopedAiAdapter({
    env: makeEnv({ ...options?.env, AI: { run: aiRun } }),
    default: {
      extractTransaction: (...args) => defaultExtract(...args),
      classifyCategory: (...args) => defaultClassify(...args),
      generateMessage: () => Promise.resolve("default"),
    } satisfies AiPort,
    userGatewayRepo: { getByUserId: (userId) => getByUserId(userId) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

  return { adapter, getByUserId, defaultExtract, defaultClassify, aiRun };
}

describe("user scoped ai adapter", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("falls back to the default adapter when no scope is provided", async () => {
    const { adapter, defaultExtract, getByUserId } = makeDeps({
      mode: "byok",
      provider: "vercel",
      apiKey: "k",
    });

    await adapter.extractTransaction("S/ 50 en Tambo");

    expect(defaultExtract).toHaveBeenCalledWith("S/ 50 en Tambo", undefined);
    expect(getByUserId).not.toHaveBeenCalled();
  });

  it("routes to the default adapter when the user has no gateway config", async () => {
    const { adapter, defaultClassify, getByUserId } = makeDeps(null);

    await adapter.classifyCategory({ userReply: "comida", categories: [] }, { userId: "u_1" });

    expect(getByUserId).toHaveBeenCalledWith("u_1");
    expect(defaultClassify).toHaveBeenCalled();
  });

  it("falls back to default when the gateway lookup fails", async () => {
    const { adapter, defaultClassify } = makeDeps(null, { lookupShouldThrow: true });

    await adapter.classifyCategory({ userReply: "comida", categories: [] }, { userId: "u_1" });

    expect(defaultClassify).toHaveBeenCalled();
  });

  describe("byok mode", () => {
    it("builds and caches a per-user SDK adapter from the stored config", async () => {
      generateObjectMock.mockResolvedValue({
        object: { amount: 50, currency: "PEN", merchant: "Tambo", date: "2026-02-20" },
      });
      const { adapter, defaultExtract, getByUserId } = makeDeps({
        mode: "byok",
        provider: "openrouter",
        apiKey: "sk-or-user-key",
        modelId: "anthropic/claude-3.5-haiku",
        baseUrl: "https://custom.example.com/v1",
      });

      await adapter.extractTransaction("S/ 50 en Tambo", { userId: "u_byo" });
      await adapter.extractTransaction("otro gasto", { userId: "u_byo" });

      expect(defaultExtract).not.toHaveBeenCalled();
      expect(getByUserId).toHaveBeenCalledTimes(1);
      expect(generateObjectMock).toHaveBeenCalledTimes(2);
      const callInput = generateObjectMock.mock.calls[0][0] as { model: { modelId: string } };
      expect(callInput.model.modelId).toBe("anthropic/claude-3.5-haiku");
    });
  });

  describe("managed mode", () => {
    it("runs the picked model through the platform cloudflare binding without any key", async () => {
      const aiRun = vi.fn().mockResolvedValue({
        response: {
          amount: 20,
          currency: "PEN",
          merchant: "Metro",
          date: "2026-02-21",
          bank: "BCP",
          rawText: "gasto",
        },
      });
      const { adapter, defaultExtract } = makeDeps(
        { mode: "managed", modelId: "@cf/meta/llama-3.1-8b-instruct-fast" },
        { aiRun },
      );

      const extracted = await adapter.extractTransaction("gaste 20 en metro", {
        userId: "u_managed",
      });

      expect(defaultExtract).not.toHaveBeenCalled();
      expect(aiRun).toHaveBeenCalledWith("@cf/meta/llama-3.1-8b-instruct-fast", expect.anything());
      expect(extracted).toMatchObject({ amount: 20, merchant: "Metro" });
    });

    it("runs the picked model on the platform sdk gateway credentials when platform is vercel", async () => {
      generateObjectMock.mockResolvedValue({
        object: { categoryId: "cat_food", confidence: 0.9 },
      });
      const { adapter } = makeDeps(
        { mode: "managed", modelId: "openai/gpt-4o-mini" },
        {
          env: { AI_PROVIDER: "vercel", VERCEL_AI_API_KEY: "platform-key" },
        },
      );

      const result = await adapter.classifyCategory(
        {
          userReply: "menu del dia",
          categories: [{ id: "cat_food", name: "Comida", slug: "comida" }],
        },
        { userId: "u_managed_v" },
      );

      expect(result).toEqual({ categoryId: "cat_food", confidence: 0.9 });
      const callInput = generateObjectMock.mock.calls[0][0] as { model: { modelId: string } };
      expect(callInput.model.modelId).toBe("openai/gpt-4o-mini");
    });

    it("rejects models outside the managed allowlist and falls back to default", async () => {
      const { adapter, defaultExtract } = makeDeps(
        { mode: "managed", modelId: "anthropic/claude-opus-4" },
        { env: { PLATFORM_MANAGED_MODELS: "openai/gpt-4o-mini" } },
      );

      await adapter.extractTransaction("gasto", { userId: "u_greedy" });

      expect(defaultExtract).toHaveBeenCalled();
    });
  });
});
