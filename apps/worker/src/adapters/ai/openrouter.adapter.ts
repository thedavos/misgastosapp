import type { WorkerEnv } from "types/env";
import { createOpenAiCompatibleAiAdapter } from "@/adapters/ai/openai-compatible.adapter";
import type { AiPort } from "@/ports/ai.port";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export function resolveOpenRouterConfig(env: WorkerEnv): {
  apiKey?: string;
  baseURL: string;
  modelId: string;
} {
  return {
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    modelId: env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
  };
}

export function createOpenRouterAdapter(env: WorkerEnv): AiPort {
  const config = resolveOpenRouterConfig(env);
  return createOpenAiCompatibleAiAdapter({
    providerName: "openrouter",
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    modelId: config.modelId,
    promptsKv: env.PROMPTS_KV,
    headers: {
      // Recommended attribution headers for OpenRouter app rankings
      "HTTP-Referer": "https://misgastos.app",
      "X-Title": "Misgastos.app",
    },
  });
}
