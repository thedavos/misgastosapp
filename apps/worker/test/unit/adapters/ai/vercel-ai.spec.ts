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
import { resolveVercelAiConfig, createVercelAiAdapter } from "@/adapters/ai/vercel-ai.adapter";

function makeEnv(overrides?: Partial<Record<string, unknown>>): WorkerEnv {
  return {
    AI_PROVIDER: "vercel",
    VERCEL_AI_API_KEY: "test-key",
    PROMPTS_KV: {
      get: async () => null,
    },
    ...overrides,
  } as unknown as WorkerEnv;
}

describe("vercel ai adapter", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("resolves gateway config with defaults", () => {
    const config = resolveVercelAiConfig(makeEnv());
    expect(config).toEqual({
      apiKey: "test-key",
      baseURL: "https://ai-gateway.vercel.sh/v1",
      modelId: "openai/gpt-4o-mini",
    });
  });

  it("honors custom base url and model overrides", () => {
    const config = resolveVercelAiConfig(
      makeEnv({
        VERCEL_AI_BASE_URL: "https://example.com/v1/",
        VERCEL_AI_MODEL: "anthropic/claude-3-5-haiku-latest",
      }),
    );
    expect(config.baseURL).toBe("https://example.com/v1/");
    expect(config.modelId).toBe("anthropic/claude-3-5-haiku-latest");
  });

  it("extracts and normalizes a transaction from model output", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        amount: 50,
        currency: "PEN",
        merchant: "Tambo",
        date: "2026-02-20T10:00:00.000Z",
        bank: "BCP",
        rawText: "consumo en tambo",
      },
    });

    const adapter = createVercelAiAdapter(makeEnv());
    const extracted = await adapter.extractTransaction("S/ 50 en Tambo");

    expect(extracted).toMatchObject({
      amount: 50,
      currency: "PEN",
      merchant: "Tambo",
      bank: "BCP",
    });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock.mock.calls[0][0]).toMatchObject({
      system: "Eres un extractor preciso de transacciones financieras.",
    });
  });

  it("returns heuristic classification without calling the model on exact match", async () => {
    const adapter = createVercelAiAdapter(makeEnv());
    const result = await adapter.classifyCategory({
      userReply: "Comida",
      categories: [{ id: "cat_food", name: "Comida", slug: "comida" }],
    });

    expect(result).toEqual({ categoryId: "cat_food", confidence: 0.99 });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("classifies via the model when heuristics miss", async () => {
    generateObjectMock.mockResolvedValue({
      object: { categoryId: "cat_transport", confidence: 0.9 },
    });

    const adapter = createVercelAiAdapter(makeEnv());
    const result = await adapter.classifyCategory({
      userReply: "pasaje en bus",
      categories: [
        { id: "cat_food", name: "Comida", slug: "comida" },
        { id: "cat_transport", name: "Transporte", slug: "transporte" },
      ],
    });

    expect(result).toEqual({ categoryId: "cat_transport", confidence: 0.9 });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("returns deterministic templates for user-facing messages", async () => {
    const adapter = createVercelAiAdapter(makeEnv());

    const ask = await adapter.generateMessage({
      kind: "ask_category",
      amount: 50,
      currency: "PEN",
      merchant: "Tambo",
      categories: [{ id: "cat_food", name: "Comida", slug: "comida" }],
    });
    expect(ask).toContain("Tambo");
    expect(ask).toContain("Comida");

    const confirmation = await adapter.generateMessage({
      kind: "confirmation",
      categoryName: "Comida",
    });
    expect(confirmation.toLowerCase()).toContain("comida");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
