import { describe, expect, it, vi } from "vitest";
import { createCloudflareAiAdapter } from "@/adapters/ai/cloudflare-ai.adapter";
import type { WorkerEnv } from "types/env";

describe("cloudflare AI generateMessage", () => {
  it("returns deterministic ask_category and confirmation without calling Workers AI", async () => {
    const run = vi.fn();
    const env = {
      AI: { run },
      CLOUDFLARE_AI_MODEL: "@cf/qwen/qwen3-30b-a3b-fp8",
      PROMPTS_KV: { get: vi.fn() },
    } as unknown as WorkerEnv;

    const ai = createCloudflareAiAdapter(env);

    await expect(
      ai.generateMessage({
        kind: "ask_category",
        amount: 20,
        currency: "PEN",
        merchant: "Metro",
        categories: [
          { id: "cat_food", name: "Comida", slug: "comida" },
          { id: "cat_transport", name: "Transporte", slug: "transporte" },
        ],
      }),
    ).resolves.toBe("Vi S/. 20.00 en Metro. ¿Qué categoría le pongo? (Comida, Transporte)");

    await expect(
      ai.generateMessage({
        kind: "confirmation",
        categoryName: "Transporte",
      }),
    ).resolves.toBe("Listo, ya lo guardé en Transporte.");

    expect(run).not.toHaveBeenCalled();
  });
});
