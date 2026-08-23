import { beforeEach, describe, expect, it, vi } from "vitest";

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: (input: unknown) => generateObjectMock(input),
  jsonSchema: (schema: unknown) => ({ jsonSchema: schema }),
}));

const createOpenAICompatibleMock = vi.fn(() => ({
  chatModel: vi.fn((modelId: string) => ({ modelId })),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: (input: unknown) => createOpenAICompatibleMock(input),
}));

import type { WorkerEnv } from "types/env";
import { resolveOpenRouterConfig, createOpenRouterAdapter } from "@/adapters/ai/openrouter.adapter";

function makeEnv(overrides?: Partial<Record<string, unknown>>): WorkerEnv {
  return {
    AI_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "or-test-key",
    PROMPTS_KV: {
      get: async () => null,
    },
    ...overrides,
  } as unknown as WorkerEnv;
}

describe("openrouter adapter", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    createOpenAICompatibleMock.mockClear();
  });

  it("resolves openrouter config with defaults", () => {
    const config = resolveOpenRouterConfig(makeEnv());
    expect(config).toEqual({
      apiKey: "or-test-key",
      baseURL: "https://openrouter.ai/api/v1",
      modelId: "openai/gpt-4o-mini",
    });
  });

  it("honors custom base url and model overrides", () => {
    const config = resolveOpenRouterConfig(
      makeEnv({
        OPENROUTER_BASE_URL: "https://proxy.example.com/v1",
        OPENROUTER_MODEL: "anthropic/claude-3.5-haiku",
      }),
    );
    expect(config.baseURL).toBe("https://proxy.example.com/v1");
    expect(config.modelId).toBe("anthropic/claude-3.5-haiku");
  });

  it("builds the provider with attribution headers and model id", () => {
    createOpenRouterAdapter(makeEnv());

    expect(createOpenAICompatibleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "openrouter",
        apiKey: "or-test-key",
        baseURL: "https://openrouter.ai/api/v1",
        headers: expect.objectContaining({
          "HTTP-Referer": "https://misgastos.app",
          "X-Title": "Misgastos.app",
        }),
      }),
    );
  });

  it("extracts and normalizes a transaction from model output", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        amount: 25.5,
        currency: "PEN",
        merchant: "Metro",
        date: "2026-02-21T12:00:00.000Z",
        bank: "unknown",
        rawText: "",
      },
    });

    const adapter = createOpenRouterAdapter(makeEnv());
    const extracted = await adapter.extractTransaction("gaste 25.5 soles en metro");

    expect(extracted).toMatchObject({
      amount: 25.5,
      currency: "PEN",
      merchant: "Metro",
      rawText: "gaste 25.5 soles en metro",
    });
  });

  it("classifies via the model when heuristics miss", async () => {
    generateObjectMock.mockResolvedValue({ object: { categoryId: null, confidence: 0.1 } });

    const adapter = createOpenRouterAdapter(makeEnv());
    const result = await adapter.classifyCategory({
      userReply: "algo raro",
      categories: [{ id: "cat_food", name: "Comida", slug: "comida" }],
    });

    expect(result).toEqual({ categoryId: null, confidence: 0.1 });
  });
});
